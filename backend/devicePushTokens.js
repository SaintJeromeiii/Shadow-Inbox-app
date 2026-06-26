const fs = require('fs');
const path = require('path');

const TOKENS_PATH = path.join(__dirname, 'device_push_tokens.json');

function readTokenStore() {
  try {
    if (!fs.existsSync(TOKENS_PATH)) {
      return { tokens: [] };
    }

    const parsed = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    const tokens = Array.isArray(parsed?.tokens) ? parsed.tokens : [];
    return { tokens };
  } catch {
    return { tokens: [] };
  }
}

function writeTokenStore(store) {
  fs.writeFileSync(TOKENS_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function listDevicePushTokens() {
  return readTokenStore().tokens.map((entry) => entry.token);
}

function registerDevicePushToken(pushToken, meta = {}) {
  const token = String(pushToken || '').trim();
  if (!token) {
    throw new Error('Missing push token.');
  }

  const store = readTokenStore();
  const now = new Date().toISOString();
  const existing = store.tokens.find((entry) => entry.token === token);

  if (existing) {
    existing.lastSeenAt = now;
    existing.platform = meta.platform || existing.platform || null;
    existing.deviceName = meta.deviceName || existing.deviceName || null;
  } else {
    store.tokens.push({
      token,
      platform: meta.platform || null,
      deviceName: meta.deviceName || null,
      registeredAt: now,
      lastSeenAt: now,
    });
  }

  writeTokenStore(store);
  return store.tokens.length;
}

function removeDevicePushToken(pushToken) {
  const token = String(pushToken || '').trim();
  if (!token) return 0;

  const store = readTokenStore();
  const nextTokens = store.tokens.filter((entry) => entry.token !== token);
  writeTokenStore({ tokens: nextTokens });
  return store.tokens.length - nextTokens.length;
}

module.exports = {
  registerDevicePushToken,
  removeDevicePushToken,
  listDevicePushTokens,
};
