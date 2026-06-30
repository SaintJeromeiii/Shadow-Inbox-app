const {
  getLogByMessageId,
  upsertLog,
  updateLogByMessageId,
  shouldSkipCompletedInbound,
  shouldSkipInFlightInbound,
} = require('./automationLogsService');

/**
 * Idempotency guard for inbound webhook / platform ingest events.
 * Skips duplicates when message_id was already completed.
 */
async function processInboundWebhook(messageId, accountKey, handler) {
  const key = String(messageId || '').trim();
  if (!key) {
    throw new Error('Inbound webhook requires message_id for idempotency.');
  }

  const existing = await getLogByMessageId(key);
  if (shouldSkipCompletedInbound(existing)) {
    console.log(`[AutomationLogs] Skipping duplicate inbound webhook: ${key}`);
    return {
      duplicate: true,
      skipped: true,
      messageId: key,
      status: existing.status,
    };
  }

  if (shouldSkipInFlightInbound(existing)) {
    console.log(`[AutomationLogs] Skipping in-flight inbound webhook: ${key}`);
    return {
      duplicate: true,
      inFlight: true,
      messageId: key,
      status: existing.status,
    };
  }

  await upsertLog({
    messageId: key,
    accountKey,
    eventType: 'inbound_webhook',
    status: 'pending',
    errorMessage: null,
    payload: { accountKey },
  });

  try {
    await updateLogByMessageId(key, { status: 'processing', errorMessage: null });
    const result = await handler();
    await updateLogByMessageId(key, {
      status: 'completed',
      errorMessage: null,
      resultPayload: result ?? null,
    });

    return {
      duplicate: false,
      messageId: key,
      ...result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Inbound webhook failed.';
    await updateLogByMessageId(key, {
      status: 'failed',
      errorMessage: message,
    });
    throw error;
  }
}

/**
 * Ingest one or more platform messages with per-message idempotency checks.
 */
async function ingestPlatformMessagesWithIdempotency(accountKey, incomingNotifications, ingestFn) {
  if (!Array.isArray(incomingNotifications) || incomingNotifications.length === 0) {
    return ingestFn(accountKey, []);
  }

  let ingested = 0;
  let duplicates = 0;
  let blocked = 0;
  let total = 0;

  for (const notification of incomingNotifications) {
    if (!notification?.id) continue;

    const result = await processInboundWebhook(notification.id, accountKey, async () =>
      ingestFn(accountKey, [notification]),
    );

    if (result.duplicate) {
      duplicates += 1;
      continue;
    }

    ingested += result.ingested || 0;
    blocked += result.blocked || 0;
    total = Math.max(total, result.total || 0);
  }

  if (ingested === 0 && duplicates === 0) {
    const empty = await ingestFn(accountKey, []);
    total = empty.total || 0;
  }

  return {
    ingested,
    duplicates,
    blocked,
    total,
  };
}

module.exports = {
  processInboundWebhook,
  ingestPlatformMessagesWithIdempotency,
};
