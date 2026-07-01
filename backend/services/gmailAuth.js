const { getAccount, resolveAccountKey } = require('../accounts');
const {
  getValidAccessToken,
  refreshAccessToken,
  needsAccessTokenRefresh,
  TOKEN_REFRESH_BUFFER_MS,
} = require('../googleOAuth');
const { getOAuthAccount } = require('../userTokens');

/**
 * Ensures a fresh Gmail access token before IMAP polling or Gmail API calls.
 * Refreshes automatically when the token is missing, expired, or within the buffer window.
 */
async function ensureGmailAccessToken(accountKey) {
  const resolvedKey = resolveAccountKey(accountKey);
  const account = getOAuthAccount(resolvedKey);

  if (!account) {
    throw new Error(`OAuth account not found: ${resolvedKey}`);
  }

  if (!needsAccessTokenRefresh(account)) {
    return account.accessToken;
  }

  if (!account.refreshToken) {
    throw new Error(
      `No refresh token stored for "${account.email}". Re-link Google in the mobile app.`,
    );
  }

  console.log(
    `[GmailAuth] Token for ${account.email} is expired or expiring within ${Math.round(TOKEN_REFRESH_BUFFER_MS / 60000)} min — requesting new access token...`,
  );

  const refreshed = await refreshAccessToken(resolvedKey);

  console.log(`[GmailAuth] Access token refreshed for ${account.email}`);

  return refreshed.accessToken;
}

/**
 * Builds Gmail IMAP OAuth config after validating or refreshing the access token.
 */
async function getGmailImapAuthConfig(accountKey) {
  const account = getAccount(resolveAccountKey(accountKey));
  if (!account) {
    throw new Error(`Unknown account key: ${accountKey}`);
  }

  if (!account.oauth) {
    throw new Error(`Account "${account.key}" is not a Google OAuth inbox.`);
  }

  const accessToken = await ensureGmailAccessToken(account.key);

  return {
    account,
    accessToken,
    imap: {
      user: account.email,
      host: account.imap.host || 'imap.gmail.com',
      port: account.imap.port || 993,
    },
  };
}

module.exports = {
  ensureGmailAccessToken,
  getGmailImapAuthConfig,
  TOKEN_REFRESH_BUFFER_MS,
};
