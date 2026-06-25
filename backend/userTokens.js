const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./accountsConstants');

const TOKENS_PATH = path.join(__dirname, 'user_tokens.json');

const ACCENT_COLORS = ['#5B8DEF', '#6EE7A0', '#FFB347', '#C084FC', '#FF8A8A', '#67E8F9'];

function readTokenStore() {
  try {
    const raw = fs.readFileSync(TOKENS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.accounts && typeof parsed.accounts === 'object'
      ? parsed
      : { accounts: {} };
  } catch {
    return { accounts: {} };
  }
}

function writeTokenStore(store) {
  fs.writeFileSync(TOKENS_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

const {
  initialsFromProfile,
  collectUsedInitials,
} = require('./accountInitials');

function accountKeyFromEmail(email) {
  const slug = email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `google_${slug}`;
}

function pickAccentColor(existingKeys) {
  const index = existingKeys.length % ACCENT_COLORS.length;
  return ACCENT_COLORS[index];
}

function feedFileForAccountKey(accountKey) {
  return `account_${accountKey}_notifications.json`;
}

function getOAuthAccount(accountKey) {
  const store = readTokenStore();
  return store.accounts[accountKey] ?? null;
}

function listOAuthAccountKeys() {
  const store = readTokenStore();
  return Object.keys(store.accounts);
}

function listOAuthAccounts() {
  return listOAuthAccountKeys().map((key) => getOAuthAccount(key)).filter(Boolean);
}

function upsertOAuthAccount({
  email,
  displayName,
  accessToken,
  refreshToken,
  expiresIn,
  scope,
  oauthClientId,
  oauthRedirectUri,
  oauthClientType = 'android',
}) {
  const store = readTokenStore();
  const accountKey = accountKeyFromEmail(email);
  const existing = store.accounts[accountKey];
  const expiresAt = Date.now() + Number(expiresIn || 3600) * 1000;
  const usedInitials = collectUsedInitials(Object.values(store.accounts));

  const profile = {
    accountKey,
    email,
    displayName: displayName || email,
    label: `Google · ${email}`,
    initials: initialsFromProfile(displayName, email, usedInitials),
    accentColor: existing?.accentColor ?? pickAccentColor(Object.keys(store.accounts)),
    feedFile: feedFileForAccountKey(accountKey),
    accessToken,
    refreshToken: refreshToken || existing?.refreshToken || null,
    expiresAt,
    scope: scope || existing?.scope || null,
    oauth: true,
    oauthClientId: oauthClientId || existing?.oauthClientId || null,
    oauthRedirectUri: oauthRedirectUri || existing?.oauthRedirectUri || null,
    oauthClientType: oauthClientType || existing?.oauthClientType || 'android',
    addedAt: existing?.addedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.accounts[accountKey] = profile;
  writeTokenStore(store);
  return profile;
}

function updateOAuthTokens(accountKey, { accessToken, refreshToken, expiresIn, scope }) {
  const store = readTokenStore();
  const existing = store.accounts[accountKey];
  if (!existing) {
    throw new Error(`OAuth account not found: ${accountKey}`);
  }

  store.accounts[accountKey] = {
    ...existing,
    accessToken,
    refreshToken: refreshToken || existing.refreshToken,
    expiresAt: Date.now() + Number(expiresIn || 3600) * 1000,
    scope: scope || existing.scope,
    updatedAt: new Date().toISOString(),
  };

  writeTokenStore(store);
  return store.accounts[accountKey];
}

function toPublicProfile(record) {
  const store = readTokenStore();
  const usedInitials = collectUsedInitials(
    Object.values(store.accounts).filter((item) => item.accountKey !== record.accountKey),
  );

  return {
    key: record.accountKey,
    label: record.label,
    email: record.email,
    initials: initialsFromProfile(record.displayName, record.email, usedInitials),
    accentColor: record.accentColor,
    oauth: true,
    mockOnly: false,
    imapConfigured: true,
  };
}

function removeOAuthAccount(accountKey) {
  const store = readTokenStore();
  const existing = store.accounts[accountKey];
  if (!existing) {
    return null;
  }

  if (existing.feedFile) {
    const feedPath = path.join(DATA_DIR, existing.feedFile);
    try {
      if (fs.existsSync(feedPath)) {
        fs.unlinkSync(feedPath);
      }
    } catch (error) {
      console.warn(`[OAuth] Could not delete feed file for ${accountKey}:`, error);
    }
  }

  delete store.accounts[accountKey];
  writeTokenStore(store);
  return existing;
}

module.exports = {
  TOKENS_PATH,
  accountKeyFromEmail,
  getOAuthAccount,
  listOAuthAccountKeys,
  listOAuthAccounts,
  upsertOAuthAccount,
  updateOAuthTokens,
  removeOAuthAccount,
  toPublicProfile,
};
