const { findMatchingRule } = require('./autoRulesService');
const { appendHistoryEntry } = require('./autoPilotHistory');
const { sendBroadcastReplyWithRetry } = require('./relayRetryService');
const { completeTasksForNotification } = require('./taskService');
const { removeNotificationIds } = require('./notificationFeed');
const { archiveMessages } = require('./gmailClient');
const { sendAutoPilotPush } = require('./pushNotificationService');

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

function buildAutoPilotSummary(notification, rule) {
  const platform = formatPlatformLabel(notification.sourceApp);
  const sender = String(notification.sender || 'unknown').split('·')[0].trim();
  if (rule.action === 'reply' && rule.replyText) {
    return `Replied on ${platform} to ${sender}`;
  }
  if (rule.action === 'archive') {
    return `Archived routine ${platform} ping from ${sender}`;
  }
  return `Handled routine ${platform} ping from ${sender}`;
}

async function archiveNotificationSource(accountKey, notification) {
  if (notification.sourceApp !== 'Email') {
    await removeNotificationIds(accountKey, [notification.id]);
    return { archived: true, method: 'feed_remove' };
  }

  try {
    const result = await archiveMessages(accountKey, [notification.id], [notification]);
    if (result.archived > 0) {
      await removeNotificationIds(accountKey, [notification.id]);
      return { archived: true, method: 'gmail_archive' };
    }
  } catch (error) {
    console.warn(
      `[AutoPilot] Gmail archive failed for ${notification.id}:`,
      error instanceof Error ? error.message : error,
    );
  }

  await removeNotificationIds(accountKey, [notification.id]);
  return { archived: true, method: 'feed_remove_fallback' };
}

async function maybeAutoPilot(accountKey, notification) {
  if (!notification?.id || notification.status === 'auto_piloted') {
    return { handled: false, notification };
  }

  const rule = await findMatchingRule(notification);
  if (!rule) {
    return { handled: false, notification };
  }

  let dispatchResult = null;

  try {
    if (rule.action === 'reply') {
      if (!rule.replyText?.trim()) {
        throw new Error(`Rule ${rule.id} is missing replyText.`);
      }
      dispatchResult = await sendBroadcastReplyWithRetry(accountKey, notification, rule.replyText);
    }

    if (rule.autoCloseTask) {
      completeTasksForNotification(accountKey, notification.id, { markAutoPilot: true });
    }

    await archiveNotificationSource(accountKey, notification);

    const summary = buildAutoPilotSummary(notification, rule);
    const historyEntry = appendHistoryEntry({
      accountKey,
      notificationId: notification.id,
      platform: notification.sourceApp,
      sender: notification.sender,
      ruleId: rule.id,
      ruleName: rule.name,
      action: rule.action,
      replyText: rule.replyText,
      summary,
      autoCloseTask: rule.autoCloseTask,
    });

    await sendAutoPilotPush(accountKey, notification, rule, historyEntry);

    console.log(
      `[AutoPilot][${accountKey}] Rule ${rule.id} handled ${notification.id} (${notification.sourceApp}).`,
    );

    return {
      handled: true,
      rule,
      historyEntry,
      dispatchResult,
      notification: {
        ...notification,
        status: 'auto_piloted',
        autoPilot: {
          ruleId: rule.id,
          ruleName: rule.name,
          handledAt: historyEntry.timestamp,
          summary,
        },
      },
    };
  } catch (error) {
    console.error(
      `[AutoPilot][${accountKey}] Failed for ${notification.id}:`,
      error instanceof Error ? error.message : error,
    );
    return {
      handled: false,
      notification,
      error: error instanceof Error ? error.message : 'Auto-pilot failed.',
    };
  }
}

module.exports = {
  maybeAutoPilot,
  buildAutoPilotSummary,
};
