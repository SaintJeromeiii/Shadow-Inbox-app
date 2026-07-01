const { upsertLog, updateLogByMessageId } = require('./automationLogsService');

function parseSubjectFromRawText(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match?.[1]?.trim() || '(no subject)';
}

function mapTriagePriority(triage) {
  const score = Number(triage?.urgencyScore) || 0;
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

async function logInboundEmailTriage(accountKey, notification, triage) {
  if (!notification?.id || !triage) {
    return;
  }

  const subject = parseSubjectFromRawText(notification.rawText);
  const priority = mapTriagePriority(triage);
  const logPayload = {
    notificationId: notification.id,
    sender: notification.sender,
    subject,
    sourceApp: notification.sourceApp,
    timestamp: notification.timestamp,
    aiSummary: triage.cleanSummary,
    category: triage.category,
    priority,
  };

  try {
    await upsertLog({
      messageId: notification.id,
      accountKey,
      eventType: 'inbound_email',
      status: 'processing',
      payload: logPayload,
    });

    await updateLogByMessageId(notification.id, {
      status: 'completed',
      resultPayload: triage,
      errorMessage: null,
    });
  } catch (error) {
    console.warn(
      `[InboundLog] Failed to save automation log for ${notification.id}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

module.exports = {
  logInboundEmailTriage,
};
