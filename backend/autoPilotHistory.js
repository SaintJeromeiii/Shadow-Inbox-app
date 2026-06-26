const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HISTORY_PATH = path.join(__dirname, 'data', 'auto_pilot_history.json');
const MAX_HISTORY_ENTRIES = 200;

function readHistoryStore() {
  try {
    const raw = fs.readFileSync(HISTORY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: parsed?.version || 1,
      entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
    };
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeHistoryStore(store) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function appendHistoryEntry(entry) {
  const store = readHistoryStore();
  const record = {
    id: entry.id || `pilot-${crypto.randomBytes(5).toString('hex')}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    accountKey: entry.accountKey,
    notificationId: entry.notificationId,
    platform: entry.platform,
    sender: entry.sender,
    ruleId: entry.ruleId,
    ruleName: entry.ruleName,
    action: entry.action,
    replyText: entry.replyText || null,
    summary: entry.summary,
    autoCloseTask: Boolean(entry.autoCloseTask),
  };

  store.entries = [record, ...store.entries].slice(0, MAX_HISTORY_ENTRIES);
  writeHistoryStore(store);
  return record;
}

function listHistory({ accountKey, limit = 40 } = {}) {
  const store = readHistoryStore();
  return store.entries
    .filter((entry) => (accountKey ? entry.accountKey === accountKey : true))
    .slice(0, Math.max(1, Math.min(limit, MAX_HISTORY_ENTRIES)));
}

module.exports = {
  HISTORY_PATH,
  appendHistoryEntry,
  listHistory,
};
