const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./supabaseClient');

const TOKENS_PATH = path.join(__dirname, 'device_push_tokens.json');

function readTokenStoreFromFile() {
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

function writeTokenStoreToFile(store) {
  fs.writeFileSync(TOKENS_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function rowToEntry(row) {
  return {
    token: row.token,
    accountKey: row.account_key,
    platform: row.platform,
    deviceName: row.device_name,
    registeredAt: row.registered_at,
    lastSeenAt: row.last_seen_at,
  };
}

function entryToRow(entry) {
  return {
    token: entry.token,
    account_key: entry.accountKey || null,
    platform: entry.platform || null,
    device_name: entry.deviceName || null,
    registered_at: entry.registeredAt,
    last_seen_at: entry.lastSeenAt,
  };
}

async function readTokenStore() {
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('expo_push_tokens')
      .select('*')
      .order('last_seen_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to read push tokens: ${error.message}`);
    }

    return { tokens: (data || []).map(rowToEntry) };
  }

  return readTokenStoreFromFile();
}

async function listDevicePushTokens(accountKey = null) {
  const store = await readTokenStore();
  const tokens = store.tokens.map((entry) => entry.token);

  if (!accountKey) {
    return tokens;
  }

  return store.tokens
    .filter((entry) => !entry.accountKey || entry.accountKey === accountKey)
    .map((entry) => entry.token);
}

async function registerDevicePushToken(pushToken, meta = {}) {
  const token = String(pushToken || '').trim();
  if (!token) {
    throw new Error('Missing push token.');
  }

  if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
    throw new Error('Invalid Expo push token format.');
  }

  const now = new Date().toISOString();
  const accountKey = meta.accountKey ? String(meta.accountKey) : null;
  const store = await readTokenStore();
  const existing = store.tokens.find((entry) => entry.token === token);

  const entry = {
    token,
    accountKey: accountKey || existing?.accountKey || null,
    platform: meta.platform || existing?.platform || null,
    deviceName: meta.deviceName || existing?.deviceName || null,
    registeredAt: existing?.registeredAt || now,
    lastSeenAt: now,
  };

  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase.from('expo_push_tokens').upsert(entryToRow(entry), {
      onConflict: 'token',
    });

    if (error) {
      throw new Error(`Failed to register push token: ${error.message}`);
    }

    const { count } = await supabase
      .from('expo_push_tokens')
      .select('*', { count: 'exact', head: true });

    return count ?? store.tokens.length;
  }

  if (existing) {
    Object.assign(existing, entry);
  } else {
    store.tokens.push(entry);
  }

  writeTokenStoreToFile(store);
  return store.tokens.length;
}

async function removeDevicePushToken(pushToken) {
  const token = String(pushToken || '').trim();
  if (!token) return 0;

  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('expo_push_tokens')
      .delete()
      .eq('token', token)
      .select('token');

    if (error) {
      throw new Error(`Failed to remove push token: ${error.message}`);
    }

    return (data || []).length;
  }

  const store = readTokenStoreFromFile();
  const nextTokens = store.tokens.filter((entry) => entry.token !== token);
  writeTokenStoreToFile({ tokens: nextTokens });
  return store.tokens.length - nextTokens.length;
}

module.exports = {
  TOKENS_PATH,
  registerDevicePushToken,
  removeDevicePushToken,
  listDevicePushTokens,
};
