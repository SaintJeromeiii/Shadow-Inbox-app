const { getAccount } = require('./accounts');
const { listDevicePushTokens } = require('./devicePushTokens');
const { hasBeenPushAlerted, markPushAlerted } = require('./pushAlertState');
const { findMatchingRule } = require('./autoRulesService');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const ANDROID_CHANNEL_ID = 'shadow-inbox-high-priority';
const HIGH_URGENCY_THRESHOLD = 7;
const CRITICAL_URGENCY_THRESHOLD = 9;

const CRASH_ALERT_PATTERN =
  /\b(crash|crashed|fatal exception|stack trace|segfault|panic|uncaught exception|sentry alert|bugsnag|firebase crashlytics|critical crash)\b/i;

const SERVER_FAILURE_PATTERN =
  /\b(server down|service outage|deployment failed|500 error|502 bad gateway|503 service|incident declared|pagerduty|statuspage|production is down|database unavailable)\b/i;

const PROJECT_HINTS = [
  { key: 'AlphaRounds', pattern: /\b(alpharounds|alpha rounds)\b/i },
  { key: 'DealShield', pattern: /\b(dealshield|deal shield)\b/i },
  { key: 'ServiceLog', pattern: /\b(servicelog|service log)\b/i },
];

function resolvePriorityLevel(urgencyScore) {
  const score = Number(urgencyScore) || 0;
  if (score >= CRITICAL_URGENCY_THRESHOLD) return 'critical';
  if (score >= HIGH_URGENCY_THRESHOLD) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

function buildMessageHaystack(notification) {
  return [
    notification.rawText,
    notification.sender,
    notification.channelName,
    notification.triage?.cleanSummary,
    notification.triage?.suggestedReply,
    notification.triage?.category,
  ]
    .filter(Boolean)
    .join('\n');
}

function inferProjectName(notification) {
  const haystack = buildMessageHaystack(notification);
  for (const hint of PROJECT_HINTS) {
    if (hint.pattern.test(haystack)) {
      return hint.key;
    }
  }
  return 'Shadow Inbox';
}

function detectPriorityAlertKind(notification) {
  const haystack = buildMessageHaystack(notification);
  const triage = notification?.triage;

  if (CRASH_ALERT_PATTERN.test(haystack)) {
    return 'crash_alert';
  }

  if (SERVER_FAILURE_PATTERN.test(haystack)) {
    return 'server_failure';
  }

  if (triage?.category === 'action_required') {
    const level = resolvePriorityLevel(triage.urgencyScore);
    if (level === 'critical' || level === 'high') {
      return 'high_priority';
    }
  }

  return null;
}

async function detectRuleTriggeredKind(notification) {
  try {
    const rule = await findMatchingRule(notification);
    if (!rule || rule.enabled === false) {
      return null;
    }

    if (/critical|urgent|pager|incident|crash|outage/i.test(rule.name)) {
      return 'rule_trigger';
    }

    return null;
  } catch {
    return null;
  }
}

function shouldSendPriorityPush(notification) {
  return Boolean(detectPriorityAlertKind(notification));
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

function buildPriorityPushContent(notification, accountKey, alertKind = 'high_priority') {
  const accountName = formatAccountName(accountKey);
  const senderName = parseSenderDisplayName(notification.sender);
  const projectName = inferProjectName(notification);
  const summary =
    notification.triage?.cleanSummary?.trim() ||
    String(notification.rawText || '').slice(0, 160).trim() ||
    'Requires your immediate attention.';

  let title = `🚨 High Priority ${accountName}`;
  let body = `From: ${senderName}: ${summary}`;

  switch (alertKind) {
    case 'crash_alert':
      title = `🔴 Critical Crash Log: ${projectName}`;
      body = `${senderName}: ${summary}`;
      break;
    case 'server_failure':
      title = `🔴 Server Failure Alert: ${projectName}`;
      body = `${senderName}: ${summary}`;
      break;
    case 'rule_trigger':
      title = `⚡ Priority Rule Triggered`;
      body = `${projectName} · ${senderName}: ${summary}`;
      break;
    case 'high_priority':
    default:
      title = `🚨 High Priority ${accountName}`;
      body = `From: ${senderName}: ${summary}`;
      break;
  }

  return {
    title,
    body,
    data: {
      notificationId: notification.id,
      accountKey,
      category: notification.triage?.category ?? null,
      urgencyScore: notification.triage?.urgencyScore ?? null,
      priorityLevel: alertKind === 'high_priority' ? 'high' : 'critical',
      alertKind,
      projectName,
    },
  };
}

function buildExpoPushMessage(token, content) {
  const isCritical = content.data.priorityLevel === 'critical';

  return {
    to: token,
    title: content.title,
    body: content.body,
    sound: 'default',
    priority: 'high',
    channelId: ANDROID_CHANNEL_ID,
    badge: isCritical ? 1 : undefined,
    data: content.data,
    ...(isCritical && {
      _displayInForeground: true,
    }),
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

async function maybeSendPriorityPush(accountKey, notification, options = {}) {
  let alertKind = options.force
    ? 'high_priority'
    : detectPriorityAlertKind(notification);

  if (!alertKind) {
    alertKind = await detectRuleTriggeredKind(notification);
  }

  if (!alertKind) {
    return { sent: false, suppressed: true, reason: 'not_priority_alert' };
  }

  if (hasBeenPushAlerted(notification.id)) {
    return { sent: false, suppressed: true, reason: 'already_alerted' };
  }

  const tokens = await listDevicePushTokens(accountKey);
  const fallbackTokens = tokens.length > 0 ? tokens : await listDevicePushTokens();

  if (fallbackTokens.length === 0) {
    return { sent: false, suppressed: true, reason: 'no_registered_devices' };
  }

  const content = buildPriorityPushContent(notification, accountKey, alertKind);
  const messages = fallbackTokens.map((token) => buildExpoPushMessage(token, content));

  try {
    const result = await sendExpoPushMessages(messages);
    markPushAlerted(notification.id);
    console.log(
      `[Push][${accountKey}] Sent ${alertKind} alert for ${notification.id} to ${result.sent} device(s).`,
    );
    return { sent: true, alertKind, ...result, content };
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
  const tokens = await listDevicePushTokens(accountKey);
  const fallbackTokens = tokens.length > 0 ? tokens : await listDevicePushTokens();

  if (fallbackTokens.length === 0) {
    return { sent: false, suppressed: true, reason: 'no_registered_devices' };
  }

  const platform = formatPlatformLabel(notification.sourceApp);
  const title = '🤖 Auto-Pilot';
  const body = `Handled routine ping from ${platform}. ${historyEntry.summary}`;

  const messages = fallbackTokens.map((token) => ({
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
  CRITICAL_URGENCY_THRESHOLD,
  resolvePriorityLevel,
  detectPriorityAlertKind,
  shouldSendPriorityPush,
  buildPriorityPushContent,
  maybeSendPriorityPush,
  sendAutoPilotPush,
};
