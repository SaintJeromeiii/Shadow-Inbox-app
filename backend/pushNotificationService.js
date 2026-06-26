const { getAccount } = require('./accounts');
const { listDevicePushTokens } = require('./devicePushTokens');
const { hasBeenPushAlerted, markPushAlerted } = require('./pushAlertState');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const ANDROID_CHANNEL_ID = 'shadow-inbox-high-priority';
const HIGH_URGENCY_THRESHOLD = 7;

function resolvePriorityLevel(urgencyScore) {
  const score = Number(urgencyScore) || 0;
  if (score >= HIGH_URGENCY_THRESHOLD) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

function shouldSendPriorityPush(triage) {
  if (!triage) return false;
  if (triage.category !== 'action_required') return false;
  return resolvePriorityLevel(triage.urgencyScore) === 'high';
}

function formatAccountName(accountKey) {
  const account = getAccount(accountKey);
  if (!account?.label) return accountKey;
  return account.label.replace(/\s+Account$/i, '').trim() || account.label;
}

function parseSenderDisplayName(sender) {
  const value = String(sender || 'Unknown');
  const quoted = value.match(/^"([^"]+)"/);
  if (quoted?.[1]) return quoted[1];

  const beforeAngle = value.match(/^([^<]+)</);
  if (beforeAngle?.[1]) {
    return beforeAngle[1].trim().replace(/^"|"$/g, '');
  }

  const email = value.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return email?.[0] ?? value;
}

function buildPriorityPushContent(notification, accountKey) {
  const accountName = formatAccountName(accountKey);
  const senderName = parseSenderDisplayName(notification.sender);
  const reason =
    notification.triage?.cleanSummary?.trim() ||
    'Requires your immediate attention.';

  return {
    title: `🚨 High Priority ${accountName}`,
    body: `From: ${senderName}: ${reason}`,
    data: {
      notificationId: notification.id,
      accountKey,
      category: notification.triage?.category ?? null,
      urgencyScore: notification.triage?.urgencyScore ?? null,
      priorityLevel: 'high',
    },
  };
}

async function sendExpoPushMessages(messages) {
  if (messages.length === 0) return { sent: 0 };

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.message ||
      `Expo push API returned ${response.status}`;
    throw new Error(message);
  }

  const tickets = Array.isArray(payload?.data) ? payload.data : [payload?.data];
  const errors = tickets.filter((ticket) => ticket?.status === 'error');
  if (errors.length > 0) {
    console.warn('[Push] Expo ticket errors:', errors);
  }

  return {
    sent: tickets.filter((ticket) => ticket?.status === 'ok').length,
    tickets,
  };
}

async function maybeSendPriorityPush(accountKey, notification) {
  const triage = notification?.triage;
  if (!shouldSendPriorityPush(triage)) {
    return { sent: false, suppressed: true, reason: 'not_high_priority_action_required' };
  }

  if (hasBeenPushAlerted(notification.id)) {
    return { sent: false, suppressed: true, reason: 'already_alerted' };
  }

  const tokens = listDevicePushTokens();
  if (tokens.length === 0) {
    return { sent: false, suppressed: true, reason: 'no_registered_devices' };
  }

  const content = buildPriorityPushContent(notification, accountKey);
  const messages = tokens.map((token) => ({
    to: token,
    title: content.title,
    body: content.body,
    sound: 'default',
    priority: 'high',
    channelId: ANDROID_CHANNEL_ID,
    data: content.data,
  }));

  try {
    const result = await sendExpoPushMessages(messages);
    markPushAlerted(notification.id);
    console.log(
      `[Push][${accountKey}] Sent high-priority alert for ${notification.id} to ${result.sent} device(s).`,
    );
    return { sent: true, ...result, content };
  } catch (error) {
    console.error(`[Push][${accountKey}] Failed for ${notification.id}:`, error);
    return {
      sent: false,
      suppressed: false,
      error: error instanceof Error ? error.message : 'Push send failed.',
    };
  }
}

function formatPlatformLabel(sourceApp) {
  switch (sourceApp) {
    case 'Slack':
      return 'Slack';
    case 'Discord':
      return 'Discord';
    case 'Email':
      return 'Gmail';
    default:
      return sourceApp || 'Inbox';
  }
}

async function sendAutoPilotPush(accountKey, notification, rule, historyEntry) {
  const tokens = listDevicePushTokens();
  if (tokens.length === 0) {
    return { sent: false, suppressed: true, reason: 'no_registered_devices' };
  }

  const platform = formatPlatformLabel(notification.sourceApp);
  const title = '🤖 Auto-Pilot';
  const body = `Handled routine ping from ${platform}. ${historyEntry.summary}`;

  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    priority: 'default',
    data: {
      type: 'auto_pilot',
      accountKey,
      notificationId: notification.id,
      ruleId: rule.id,
      ruleName: rule.name,
      platform: notification.sourceApp,
      historyId: historyEntry.id,
      priorityLevel: 'low',
    },
  }));

  try {
    const result = await sendExpoPushMessages(messages);
    console.log(
      `[Push][${accountKey}] Sent auto-pilot summary for ${notification.id} to ${result.sent} device(s).`,
    );
    return { sent: true, ...result, title, body };
  } catch (error) {
    console.error(`[Push][${accountKey}] Auto-pilot push failed:`, error);
    return {
      sent: false,
      error: error instanceof Error ? error.message : 'Auto-pilot push failed.',
    };
  }
}

module.exports = {
  ANDROID_CHANNEL_ID,
  HIGH_URGENCY_THRESHOLD,
  resolvePriorityLevel,
  shouldSendPriorityPush,
  buildPriorityPushContent,
  maybeSendPriorityPush,
  sendAutoPilotPush,
};
