const fs = require('fs');
const path = require('path');

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

function accountKeyFromEmail(email) {
  const slug = email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `google_${slug}`;
}

function initialsFromProfile(displayName, email) {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }

  const local = email.split('@')[0] ?? 'GO';
  return local.slice(0, 2).toUpperCase();
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

  const profile = {
    accountKey,
    email,
    displayName: displayName || email,
    label: `Google · ${email}`,
    initials: initialsFromProfile(displayName, email),
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
  return {
    key: record.accountKey,
    label: record.label,
    email: record.email,
    initials: record.initials,
    accentColor: record.accentColor,
    oauth: true,
    mockOnly: false,
    imapConfigured: true,
  };
}

module.exports = {
  TOKENS_PATH,
  accountKeyFromEmail,
  getOAuthAccount,
  listOAuthAccountKeys,
  listOAuthAccounts,
  upsertOAuthAccount,
  updateOAuthTokens,
  toPublicProfile,
};
