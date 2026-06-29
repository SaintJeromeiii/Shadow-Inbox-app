const {
  ACTION_PRIORITY,
  listFirewallRules,
} = require('./firewallRulesService');

function extractSubject(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

function buildNotificationHaystack(notification) {
  return [
    notification.sender,
    extractSubject(notification.rawText),
    notification.rawText,
    notification.sourceApp,
    notification.channelName,
    notification.triage?.cleanSummary,
  ]
    .filter(Boolean)
    .join('\n');
}

function extractSenderEmail(sender) {
  const angleMatch = String(sender || '').match(/<([^>]+@[^>]+)>/);
  if (angleMatch) return angleMatch[1].trim().toLowerCase();

  const emailMatch = String(sender || '').match(/[\w.+-]+@[\w.-]+\.\w+/);
  return emailMatch?.[0]?.toLowerCase() ?? String(sender || '').trim().toLowerCase();
}

function ruleMatchesNotification(rule, notification) {
  const needle = String(rule.matchValue || '').trim().toLowerCase();
  if (!needle) return false;

  if (rule.ruleType === 'sender') {
    const senderEmail = extractSenderEmail(notification.sender);
    const senderHaystack = String(notification.sender || '').toLowerCase();
    return senderEmail === needle || senderHaystack.includes(needle);
  }

  if (rule.ruleType === 'subject_keyword') {
    const subject = extractSubject(notification.rawText).toLowerCase();
    const haystack = buildNotificationHaystack(notification).toLowerCase();
    return subject.includes(needle) || haystack.includes(needle);
  }

  if (rule.ruleType === 'app_source') {
    const source = String(notification.sourceApp || '').toLowerCase();
    const haystack = buildNotificationHaystack(notification).toLowerCase();
    return source === needle || haystack.includes(needle);
  }

  return false;
}

function evaluateFirewallForNotification(notification, rules) {
  const activeRules = (rules || []).filter((rule) => rule.isActive !== false);
  const matches = activeRules.filter((rule) => ruleMatchesNotification(rule, notification));

  if (matches.length === 0) {
    return {
      matched: false,
      actionEffect: null,
      ruleId: null,
      blockDrop: false,
      mutedArchive: false,
      forceHighPriority: false,
    };
  }

  const winningRule = matches.sort(
    (a, b) => (ACTION_PRIORITY[b.actionEffect] || 0) - (ACTION_PRIORITY[a.actionEffect] || 0),
  )[0];

  return {
    matched: true,
    actionEffect: winningRule.actionEffect,
    ruleId: winningRule.id,
    ruleType: winningRule.ruleType,
    matchValue: winningRule.matchValue,
    blockDrop: winningRule.actionEffect === 'BLOCK_DROP',
    mutedArchive: winningRule.actionEffect === 'MUTED_ARCHIVE',
    forceHighPriority: winningRule.actionEffect === 'HIGH_PRIORITY_PUSH',
  };
}

async function loadActiveFirewallRules(accountKey) {
  return listFirewallRules(accountKey, { activeOnly: true });
}

function applyFirewallHighPriority(notification) {
  const triage = notification.triage || {
    category: 'action_required',
    cleanSummary: extractSubject(notification.rawText) || 'Priority signal',
    suggestedReply: null,
    urgencyScore: 9,
  };

  return {
    ...notification,
    triage: {
      ...triage,
      category: 'action_required',
      urgencyScore: Math.max(9, Number(triage.urgencyScore) || 0),
    },
    firewall: {
      ...(notification.firewall || {}),
      highPriority: true,
    },
  };
}

function applyFirewallMutedArchive(notification) {
  return {
    ...notification,
    archived: true,
    firewall: {
      ...(notification.firewall || {}),
      muted: true,
    },
  };
}

module.exports = {
  evaluateFirewallForNotification,
  loadActiveFirewallRules,
  applyFirewallHighPriority,
  applyFirewallMutedArchive,
  ruleMatchesNotification,
};
