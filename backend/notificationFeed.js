const fs = require('fs');
const { getAccount, resolveAccountKey } = require('./accounts');

function getFeedPath(accountKey) {
  const account = getAccount(resolveAccountKey(accountKey));
  if (!account) {
    throw new Error(`Unknown account key: ${accountKey}`);
  }
  return account.feedPath;
}

function readNotifications(accountKey = 'personal') {
  const feedPath = getFeedPath(accountKey);

  try {
    const raw = fs.readFileSync(feedPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.notifications)) return parsed.notifications;
    if (Array.isArray(parsed?.emails)) return parsed.emails;
    return [];
  } catch {
    return [];
  }
}

function writeNotifications(accountKey, notifications) {
  const feedPath = getFeedPath(accountKey);
  fs.writeFileSync(
    feedPath,
    `${JSON.stringify(notifications, null, 2)}\n`,
    'utf8',
  );
}

function removeNotificationIds(accountKey, ids) {
  const idSet = new Set(ids);
  const current = readNotifications(accountKey);
  const filtered = current.filter((item) => !idSet.has(item.id));
  const removedCount = current.length - filtered.length;

  if (removedCount > 0) {
    writeNotifications(accountKey, filtered);
  }

  return { removedCount, remainingCount: filtered.length };
}

module.exports = {
  getFeedPath,
  readNotifications,
  writeNotifications,
  removeNotificationIds,
};
