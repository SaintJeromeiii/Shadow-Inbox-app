const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./supabaseClient');

const LINKS_PATH = path.join(__dirname, 'data', 'device_account_links.json');

let memoryLinks = null;
let hydratePromise = null;

function isCloudRuntime() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RENDER ||
      process.env.FLY_APP_NAME ||
      (process.env.PORT && !process.env.EMAIL_RELAY_PORT),
  );
}

function shouldEnforceDeviceAuth() {
  if (String(process.env.SHADOW_INBOX_DEVICE_AUTH || '').toLowerCase() === 'false') {
    return false;
  }

  return isCloudRuntime();
}

function readLinksFromFile() {
  try {
    const raw = fs.readFileSync(LINKS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.links && typeof parsed.links === 'object' ? parsed : { links: {} };
  } catch {
    return { links: {} };
  }
}

function writeLinksToFile(store) {
  fs.mkdirSync(path.dirname(LINKS_PATH), { recursive: true });
  fs.writeFileSync(LINKS_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function readLinkStore() {
  if (!memoryLinks) {
    memoryLinks = readLinksFromFile();
  }
  return memoryLinks;
}

function writeLinkStore(store) {
  memoryLinks = store;
  writeLinksToFile(store);
}

async function persistLinksToSupabase(store) {
  const supabase = getSupabase();
  if (!supabase) {
    return;
  }

  const rows = [];
  for (const [deviceId, accountKeys] of Object.entries(store.links || {})) {
    for (const accountKey of accountKeys) {
      rows.push({
        device_id: deviceId,
        account_key: accountKey,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from('device_account_links').upsert(rows, {
    onConflict: 'device_id,account_key',
  });

  if (error) {
    console.warn('[DeviceAuth] Supabase persist failed:', error.message);
  }
}

async function hydrateDeviceLinks() {
  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    const fileStore = readLinksFromFile();
    memoryLinks = fileStore;

    const supabase = getSupabase();
    if (!supabase) {
      return fileStore;
    }

    const { data, error } = await supabase
      .from('device_account_links')
      .select('device_id, account_key');

    if (error) {
      console.warn('[DeviceAuth] Supabase hydrate failed:', error.message);
      return fileStore;
    }

    const links = { ...fileStore.links };
    for (const row of data || []) {
      if (!row?.device_id || !row?.account_key) {
        continue;
      }

      const existing = new Set(links[row.device_id] || []);
      existing.add(row.account_key);
      links[row.device_id] = [...existing];
    }

    memoryLinks = { links };
    writeLinksToFile(memoryLinks);
    return memoryLinks;
  })();

  return hydratePromise;
}

function normalizeDeviceId(value) {
  const deviceId = String(value || '').trim();
  if (!deviceId || deviceId.length < 8 || deviceId.length > 128) {
    return '';
  }

  return deviceId;
}

function getDeviceIdFromRequest(req) {
  return normalizeDeviceId(req?.headers?.['x-device-id']);
}

function listAccountKeysForDevice(deviceId) {
  const normalized = normalizeDeviceId(deviceId);
  if (!normalized) {
    return [];
  }

  const store = readLinkStore();
  return [...(store.links[normalized] || [])];
}

function listDevicesForAccount(accountKey) {
  const key = String(accountKey || '').trim();
  if (!key) {
    return [];
  }

  const store = readLinkStore();
  return Object.entries(store.links)
    .filter(([, accountKeys]) => accountKeys.includes(key))
    .map(([deviceId]) => deviceId);
}

function linkAccountToDevice(deviceId, accountKey) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const normalizedAccountKey = String(accountKey || '').trim();

  if (!normalizedDeviceId || !normalizedAccountKey) {
    throw new Error('Device id and account key are required to link Gmail.');
  }

  const store = readLinkStore();
  const existing = new Set(store.links[normalizedDeviceId] || []);
  existing.add(normalizedAccountKey);
  store.links[normalizedDeviceId] = [...existing];
  writeLinkStore(store);
  void persistLinksToSupabase(store);
  return [...store.links[normalizedDeviceId]];
}

function unlinkAccountFromDevice(deviceId, accountKey) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const normalizedAccountKey = String(accountKey || '').trim();

  if (!normalizedDeviceId || !normalizedAccountKey) {
    return [];
  }

  const store = readLinkStore();
  const existing = store.links[normalizedDeviceId] || [];
  store.links[normalizedDeviceId] = existing.filter((key) => key !== normalizedAccountKey);

  if (store.links[normalizedDeviceId].length === 0) {
    delete store.links[normalizedDeviceId];
  }

  writeLinkStore(store);
  void persistLinksToSupabase(store);
  return listAccountKeysForDevice(normalizedDeviceId);
}

function isAccountAuthorizedForDevice(deviceId, accountKey) {
  if (!shouldEnforceDeviceAuth()) {
    return true;
  }

  const normalizedDeviceId = normalizeDeviceId(deviceId);
  if (!normalizedDeviceId) {
    return false;
  }

  return listAccountKeysForDevice(normalizedDeviceId).includes(String(accountKey || '').trim());
}

module.exports = {
  shouldEnforceDeviceAuth,
  hydrateDeviceLinks,
  getDeviceIdFromRequest,
  listAccountKeysForDevice,
  listDevicesForAccount,
  linkAccountToDevice,
  unlinkAccountFromDevice,
  isAccountAuthorizedForDevice,
};
