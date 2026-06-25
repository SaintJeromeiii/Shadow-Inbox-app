const path = require('path');
const fs = require('fs');
const { DATA_DIR, ACCOUNT_DEFINITIONS } = require('./accountsConstants');
const {
  getOAuthAccount,
  listOAuthAccountKeys,
  toPublicProfile,
} = require('./userTokens');

function readEnv(prefix, name, fallback = '') {
  return process.env[`${prefix}${name}`] || (prefix ? '' : process.env[name]) || fallback;
}

function buildBuiltinAccount(key) {
  const account = ACCOUNT_DEFINITIONS[key];
  const imapPrefix = account.imapEnvPrefix;
  const smtpPrefix = account.smtpEnvPrefix;

  return {
    ...account,
    feedPath: path.join(DATA_DIR, account.feedFile),
    oauth: false,
    imap: {
      user: readEnv(imapPrefix, 'IMAP_USER'),
      password: readEnv(imapPrefix, 'IMAP_PASSWORD'),
      host: readEnv(imapPrefix, 'IMAP_HOST', 'imap.gmail.com'),
      port: Number(readEnv(imapPrefix, 'IMAP_PORT', '993')),
    },
    smtp: {
      user: readEnv(smtpPrefix, 'SMTP_USER') || readEnv(imapPrefix, 'IMAP_USER'),
      pass: readEnv(smtpPrefix, 'SMTP_PASS') || readEnv(smtpPrefix, 'SMTP_PASSWORD'),
      host: readEnv(smtpPrefix, 'SMTP_HOST', 'smtp.gmail.com'),
      port: Number(readEnv(smtpPrefix, 'SMTP_PORT', '587')),
    },
  };
}

function buildOAuthAccountRecord(record) {
  const feedPath = path.join(DATA_DIR, record.feedFile);
  if (!fs.existsSync(feedPath)) {
    fs.writeFileSync(feedPath, '[]\n', 'utf8');
  }

  return {
    key: record.accountKey,
    label: record.label,
    email: record.email,
    initials: record.initials,
    accentColor: record.accentColor,
    feedFile: record.feedFile,
    feedPath,
    oauth: true,
    mockOnly: false,
    imap: {
      user: record.email,
      host: 'imap.gmail.com',
      port: 993,
    },
    smtp: {
      user: record.email,
      host: 'smtp.gmail.com',
      port: 587,
    },
  };
}

function getAccount(accountKey) {
  if (ACCOUNT_DEFINITIONS[accountKey]) {
    return buildBuiltinAccount(accountKey);
  }

  const oauth = getOAuthAccount(accountKey);
  if (oauth) {
    return buildOAuthAccountRecord(oauth);
  }

  return null;
}

function listBuiltinAccountKeys() {
  return Object.keys(ACCOUNT_DEFINITIONS);
}

function listAccountKeys() {
  return [...listBuiltinAccountKeys(), ...listOAuthAccountKeys()];
}

function listAccounts() {
  const builtin = listBuiltinAccountKeys().map((key) => {
    const account = getAccount(key);
    return {
      key: account.key,
      label: account.label,
      email: account.email,
      initials: account.initials,
      accentColor: account.accentColor,
      mockOnly: Boolean(account.mockOnly),
      oauth: false,
      imapConfigured: Boolean(account.imap.user && account.imap.password),
    };
  });

  const oauth = listOAuthAccountKeys()
    .map((key) => getOAuthAccount(key))
    .filter(Boolean)
    .map(toPublicProfile);

  return [...builtin, ...oauth];
}

function resolveAccountKey(raw) {
  const key = String(raw || 'personal').trim().toLowerCase();
  if (ACCOUNT_DEFINITIONS[key] || getOAuthAccount(key)) {
    return key;
  }
  return 'personal';
}

module.exports = {
  DATA_DIR,
  ACCOUNT_DEFINITIONS,
  getAccount,
  listAccounts,
  listAccountKeys,
  resolveAccountKey,
};
