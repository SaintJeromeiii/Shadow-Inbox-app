const { sendBroadcastReply, findNotificationById } = require('./broadcastReply');
const { ingestPlatformMessages } = require('./chatIngestService');
const { sendPushNotification } = require('./services/pushNotificationService');
const {
  MAX_RELAY_RETRIES,
  getLogById,
  getLogByMessageId,
  updateLogById,
  updateLogByMessageId,
  upsertLog,
  isDeadLetter,
  buildRelayMessageId,
  relayBackoffMs,
  sleep,
} = require('./automationLogsService');

const RETRYABLE_STATUSES = new Set(['failed', 'dead_letter']);

async function notifyRelayDeadLetter({
  logId,
  sender,
  accountKey,
  errorMessage,
}) {
  try {
    await sendPushNotification(
      '⚠️ Relay Failed (Dead Letter)',
      `Email from ${sender} failed to pass rules engine. Tap to retry.`,
      {
        logId,
        screen: 'admin_logs',
        accountKey,
        ...(errorMessage ? { errorMessage } : {}),
      },
    );
  } catch (pushError) {
    console.error('[RelayRetry] Dead letter push notification failed:', pushError);
  }
}

function resolveSenderLabel(notification, log) {
  return (
    notification?.sender ||
    log?.payload?.sender ||
    log?.payload?.notificationId ||
    'Unknown sender'
  );
}

/**
 * Outbound relay with durable logging and bounded retries.
 * Retries up to MAX_RELAY_RETRIES times, then marks the log dead_letter.
 */
async function sendBroadcastReplyWithRetry(accountKey, notification, replyText, options = {}) {
  const trimmed = String(replyText || '').trim();
  if (!trimmed) {
    throw new Error('Reply text cannot be empty.');
  }

  const messageId =
    options.messageId ||
    buildRelayMessageId(accountKey, notification.id, trimmed);

  let log = await getLogByMessageId(messageId);
  if (log?.status === 'completed' && log.resultPayload) {
    console.log(`[RelayRetry] Returning cached relay result for ${messageId}`);
    return log.resultPayload;
  }

  if (isDeadLetter(log)) {
    throw new Error(
      log.errorMessage || `Relay permanently failed for ${messageId} (dead letter).`,
    );
  }

  if (!log) {
    log = await upsertLog({
      messageId,
      accountKey,
      eventType: 'outbound_relay',
      status: 'pending',
      payload: {
        accountKey,
        notificationId: notification.id,
        sourceApp: notification.sourceApp,
        replyText: trimmed,
      },
    });
  }

  let retryCount = log.retryCount || 0;

  while (true) {
    try {
      await updateLogByMessageId(messageId, {
        status: 'processing',
        errorMessage: null,
      });

      const result = await sendBroadcastReply(accountKey, notification, trimmed);

      await updateLogByMessageId(messageId, {
        status: 'completed',
        errorMessage: null,
        resultPayload: result,
        retryCount,
      });

      return result;
    } catch (error) {
      retryCount += 1;
      const message = error instanceof Error ? error.message : 'Outbound relay failed.';
      const exhausted = retryCount > MAX_RELAY_RETRIES;

      await updateLogByMessageId(messageId, {
        status: exhausted ? 'dead_letter' : 'failed',
        errorMessage: message,
        retryCount,
      });

      console.error(
        `[RelayRetry] Relay attempt failed for ${messageId} (retry ${retryCount}/${MAX_RELAY_RETRIES}): ${message}`,
      );

      if (exhausted) {
        const deadLetterLog = await getLogByMessageId(messageId);
        await notifyRelayDeadLetter({
          logId: deadLetterLog?.id ?? messageId,
          sender: resolveSenderLabel(notification, deadLetterLog),
          accountKey,
          errorMessage: message,
        });
        throw error;
      }

      await sleep(relayBackoffMs(retryCount));
      log = await getLogByMessageId(messageId);
    }
  }
}

async function replayOutboundLog(existing, accountKey) {
  const notificationId = existing.payload?.notificationId;
  const replyText = existing.payload?.replyText;

  if (!notificationId || !replyText) {
    throw new Error('Automation log is missing outbound relay payload.');
  }

  const notification = await findNotificationById(accountKey, notificationId);
  if (!notification) {
    throw new Error(
      `Original notification "${notificationId}" is no longer in the feed.`,
    );
  }

  return sendBroadcastReply(accountKey, notification, replyText);
}

async function replayInboundLog(existing, accountKey) {
  const notification =
    (existing.payload?.notification && existing.payload.notification) ||
    (await findNotificationById(accountKey, existing.messageId));

  if (!notification) {
    throw new Error(
      `Original notification "${existing.messageId}" is no longer available for replay.`,
    );
  }

  return ingestPlatformMessages(accountKey, [notification]);
}

/**
 * Manual admin replay for failed/dead_letter automation logs.
 * Fetches from automation_logs, marks processing, re-runs the stored payload.
 */
async function replayAutomationLog(logId, options = {}) {
  const existing = await getLogById(logId);
  if (!existing) {
    const error = new Error('Automation log not found.');
    error.statusCode = 404;
    throw error;
  }

  if (!RETRYABLE_STATUSES.has(existing.status)) {
    throw new Error(
      `Only failed or dead_letter logs can be replayed (status: ${existing.status}).`,
    );
  }

  const accountKey =
    options.accountKey || existing.payload?.accountKey || existing.accountKey;
  const nextRetryCount = (existing.retryCount || 0) + 1;

  console.log(
    `[Retry Engine] Replaying log ${logId} (${existing.eventType}, retry ${nextRetryCount})`,
  );

  await updateLogById(logId, {
    status: 'processing',
    retryCount: nextRetryCount,
    errorMessage: null,
    accountKey,
  });

  try {
    let result;

    if (existing.eventType === 'outbound_relay') {
      result = await replayOutboundLog(existing, accountKey);
    } else if (existing.eventType === 'inbound_webhook') {
      result = await replayInboundLog(existing, accountKey);
    } else {
      throw new Error(`Unsupported event type for replay: ${existing.eventType}`);
    }

    const log = await updateLogById(logId, {
      status: 'completed',
      errorMessage: null,
      resultPayload: result,
      accountKey,
    });

    return {
      log,
      replayed: true,
      result,
      message: 'Automation log successfully re-processed.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Replay failed.';
    const exhausted = nextRetryCount >= MAX_RELAY_RETRIES;

    console.error(`[Retry Engine Failure] Failed to process retry for ID ${logId}:`, error);

    const log = await updateLogById(logId, {
      status: exhausted ? 'dead_letter' : 'failed',
      errorMessage: message,
      accountKey,
    });

    if (exhausted) {
      await notifyRelayDeadLetter({
        logId: log.id,
        sender: resolveSenderLabel(null, existing),
        accountKey,
        errorMessage: message,
      });
    }

    const wrapped = new Error(message);
    wrapped.statusCode = 500;
    wrapped.log = log;
    throw wrapped;
  }
}

module.exports = {
  sendBroadcastReplyWithRetry,
  replayAutomationLog,
  MAX_RELAY_RETRIES,
};
