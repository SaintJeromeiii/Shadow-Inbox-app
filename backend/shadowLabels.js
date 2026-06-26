const fs = require('fs');
const path = require('path');
const { getAccount, resolveAccountKey } = require('./accounts');
const {
  listLabels,
  createLabel,
  modifyMessageLabels,
  resolveGmailMessageId,
} = require('./gmailApi');

const LABEL_CACHE_PATH = path.join(__dirname, 'shadow_label_cache.json');

const CATEGORY_LABELS = {
  action_required: 'Shadow/Action-Required',
  fyi: 'Shadow/FYI',
  ignore: 'Shadow/Newsletter',
};

const APP_LABEL_RULES = [
  { key: 'servicelog', label: 'Shadow/ServiceLog', pattern: /servicelog/i },
  { key: 'dealshield', label: 'Shadow/DealShield', pattern: /dealshield/i },
  { key: 'alpharounds', label: 'Shadow/AlphaRounds', pattern: /alpharounds|alpha rounds/i },
  {
    key: 'app_feedback',
    label: 'Shadow/App-Feedback',
    pattern: /beta tester|google play console|play testing|tester recruit|closed testing/i,
  },
];

function readLabelCache() {
  try {
    return JSON.parse(fs.readFileSync(LABEL_CACHE_PATH, 'utf8'));
  } catch {
    return { accounts: {} };
  }
}

function writeLabelCache(cache) {
  fs.writeFileSync(LABEL_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

function getCachedLabelMap(accountKey) {
  const cache = readLabelCache();
  return cache.accounts?.[accountKey] || {};
}

function setCachedLabel(accountKey, labelName, labelId) {
  const cache = readLabelCache();
  if (!cache.accounts[accountKey]) {
    cache.accounts[accountKey] = {};
  }
  cache.accounts[accountKey][labelName] = labelId;
  writeLabelCache(cache);
}

function extractSubject(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

function detectAppLabels(notification) {
  const haystack = `${extractSubject(notification.rawText)} ${notification.rawText} ${notification.sender}`;
  const labels = [];

  for (const rule of APP_LABEL_RULES) {
    if (rule.pattern.test(haystack)) {
      labels.push({ key: rule.key, name: rule.label });
    }
  }

  return labels;
}

function resolveShadowLabels(notification, triage) {
  const labels = [];
  const category = triage?.category;

  if (category && CATEGORY_LABELS[category]) {
    labels.push({
      key: category,
      name: CATEGORY_LABELS[category],
    });
  }

  for (const appLabel of detectAppLabels(notification)) {
    if (!labels.some((item) => item.name === appLabel.name)) {
      labels.push(appLabel);
    }
  }

  return labels;
}

async function ensureLabel(accountKey, labelName) {
  const cached = getCachedLabelMap(accountKey)[labelName];
  if (cached) {
    return cached;
  }

  const existing = await listLabels(accountKey);
  const found = existing.find((label) => label.name === labelName);
  if (found?.id) {
    setCachedLabel(accountKey, labelName, found.id);
    return found.id;
  }

  const created = await createLabel(accountKey, labelName);
  if (created?.id) {
    setCachedLabel(accountKey, labelName, created.id);
    return created.id;
  }

  throw new Error(`Could not create Gmail label "${labelName}" for ${accountKey}.`);
}

async function ensureShadowLabelSet(accountKey) {
  const labelNames = [
    ...Object.values(CATEGORY_LABELS),
    ...APP_LABEL_RULES.map((rule) => rule.label),
  ];

  const labelIds = {};
  for (const labelName of labelNames) {
    labelIds[labelName] = await ensureLabel(accountKey, labelName);
  }
  return labelIds;
}

async function resolveNotificationMessageId(accountKey, notification) {
  if (notification.gmailApiMessageId) {
    return notification.gmailApiMessageId;
  }

  const account = getAccount(resolveAccountKey(accountKey));
  if (!account?.oauth) {
    return null;
  }

  // notification.gmailMessageId is IMAP X-GM-MSGID — not valid for Gmail REST API calls.
  return resolveGmailMessageId(accountKey, {
    messageIdHeader: notification.messageIdHeader,
    subject: extractSubject(notification.rawText),
    timestamp: notification.timestamp,
  });
}

async function applyShadowLabelsToNotification(accountKey, notification, triage) {
  const account = getAccount(resolveAccountKey(accountKey));
  const shadowLabels = resolveShadowLabels(notification, triage);

  if (!account?.oauth || shadowLabels.length === 0) {
    return {
      ...notification,
      triage,
      shadowLabels,
      gmailMessageId: notification.gmailMessageId || null,
      gmailApiMessageId: notification.gmailApiMessageId || null,
    };
  }

  await ensureShadowLabelSet(accountKey);

  const gmailApiMessageId = await resolveNotificationMessageId(accountKey, notification);
  if (!gmailApiMessageId) {
    return {
      ...notification,
      triage,
      shadowLabels,
      gmailMessageId: notification.gmailMessageId || null,
      gmailApiMessageId: null,
    };
  }

  const allShadowLabelNames = [
    ...Object.values(CATEGORY_LABELS),
    ...APP_LABEL_RULES.map((rule) => rule.label),
  ];
  const addLabelIds = [];
  for (const label of shadowLabels) {
    addLabelIds.push(await ensureLabel(accountKey, label.name));
  }

  const removeLabelIds = [];
  for (const labelName of allShadowLabelNames) {
    if (!shadowLabels.some((label) => label.name === labelName)) {
      const labelId = getCachedLabelMap(accountKey)[labelName];
      if (labelId) {
        removeLabelIds.push(labelId);
      }
    }
  }

  await modifyMessageLabels(accountKey, gmailApiMessageId, {
    addLabelIds,
    removeLabelIds,
  });

  return {
    ...notification,
    triage,
    shadowLabels,
    gmailMessageId: notification.gmailMessageId || null,
    gmailApiMessageId,
  };
}

async function removeShadowLabelsFromNotifications(accountKey, notifications) {
  const account = getAccount(resolveAccountKey(accountKey));
  if (!account?.oauth) {
    return { removed: 0 };
  }

  const cached = getCachedLabelMap(accountKey);
  const shadowLabelIds = Object.values(cached);
  if (shadowLabelIds.length === 0) {
    return { removed: 0 };
  }

  let removed = 0;
  for (const notification of notifications) {
    const gmailMessageId = await resolveNotificationMessageId(accountKey, notification);
    if (!gmailMessageId) continue;

    await modifyMessageLabels(accountKey, gmailMessageId, {
      removeLabelIds: shadowLabelIds,
    });
    removed += 1;
  }

  return { removed };
}

module.exports = {
  CATEGORY_LABELS,
  APP_LABEL_RULES,
  resolveShadowLabels,
  ensureShadowLabelSet,
  applyShadowLabelsToNotification,
  removeShadowLabelsFromNotifications,
};
