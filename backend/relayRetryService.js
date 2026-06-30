const { sendBroadcastReply: sendBroadcastReplyOnce } = require('./broadcastReply');
const {
  MAX_RELAY_RETRIES,
  getLogByMessageId,
  upsertLog,
  updateLogByMessageId,
  isDeadLetter,
  buildRelayMessageId,
  relayBackoffMs,
  sleep,
} = require('./automationLogsService');

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

      const result = await sendBroadcastReplyOnce(accountKey, notification, trimmed);

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
        throw error;
      }

      await sleep(relayBackoffMs(retryCount));
      log = await getLogByMessageId(messageId);
    }
  }
}

async function replayAutomationLog(logId) {
  const { getLogById, resetDeadLetterLog } = require('./automationLogsService');
  const { findNotificationById } = require('./broadcastReply');

  const existing = await getLogById(logId);
  if (!existing) {
    throw new Error(`Automation log not found: ${logId}`);
  }
  if (existing.status !== 'dead_letter') {
    throw new Error('Only dead_letter logs can be replayed.');
  }

  const resetLog = await resetDeadLetterLog(logId);

  if (resetLog.eventType === 'outbound_relay') {
    const accountKey = resetLog.payload?.accountKey || resetLog.accountKey;
    const notificationId = resetLog.payload?.notificationId;
    const replyText = resetLog.payload?.replyText;

    if (!notificationId || !replyText) {
      throw new Error('Dead letter log is missing outbound relay payload.');
    }

    const notification = await findNotificationById(accountKey, notificationId);
    if (!notification) {
      throw new Error(
        `Original notification "${notificationId}" is no longer in the feed. Log reset to pending.`,
      );
    }

    const result = await sendBroadcastReplyWithRetry(accountKey, notification, replyText, {
      messageId: resetLog.messageId,
    });

    return {
      log: await getLogById(logId),
      replayed: true,
      result,
    };
  }

  return {
    log: resetLog,
    replayed: false,
    message: 'Log reset to pending. Inbound events require a fresh webhook delivery.',
  };
}

module.exports = {
  sendBroadcastReplyWithRetry,
  replayAutomationLog,
  MAX_RELAY_RETRIES,
};
