const fs = require('fs');
const path = require('path');

const ALERTED_PATH = path.join(__dirname, 'push_alerted_ids.json');
const MAX_TRACKED_IDS = 500;

function readAlertedIds() {
  try {
    if (!fs.existsSync(ALERTED_PATH)) {
      return new Set();
    }

    const parsed = JSON.parse(fs.readFileSync(ALERTED_PATH, 'utf8'));
    const ids = Array.isArray(parsed?.ids) ? parsed.ids : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function writeAlertedIds(ids) {
  const trimmed = [...ids].slice(-MAX_TRACKED_IDS);
  fs.writeFileSync(
    ALERTED_PATH,
    `${JSON.stringify({ ids: trimmed, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}

function hasBeenPushAlerted(notificationId) {
  return readAlertedIds().has(notificationId);
}

function markPushAlerted(notificationId) {
  const ids = readAlertedIds();
  ids.add(notificationId);
  writeAlertedIds(ids);
}

module.exports = {
  hasBeenPushAlerted,
  markPushAlerted,
};
