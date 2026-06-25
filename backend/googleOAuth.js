const {
  getOAuthAccount,
  upsertOAuthAccount,
  updateOAuthTokens,
} = require('./userTokens');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

function getGoogleWebClientId() {
  return (
    process.env.GOOGLE_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    ''
  );
}

function getGoogleAndroidClientId() {
  return (
    process.env.GOOGLE_ANDROID_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    ''
  );
}

function getGoogleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET || '';
}

function resolveOAuthClient({ clientId, clientType } = {}) {
  if (clientType === 'android') {
    const androidClientId = clientId || getGoogleAndroidClientId();
    if (!androidClientId) {
      throw new Error(
        'GOOGLE_ANDROID_CLIENT_ID (or EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) is required for native Android OAuth.',
      );
    }

    return {
      clientId: androidClientId,
      clientSecret: null,
      clientType: 'android',
    };
  }

  const webClientId = clientId || getGoogleWebClientId();
  const clientSecret = getGoogleClientSecret();

  if (!webClientId || !clientSecret) {
    const androidClientId = getGoogleAndroidClientId();
    if (androidClientId) {
      return {
        clientId: androidClientId,
        clientSecret: null,
        clientType: 'android',
      };
    }

    throw new Error(
      'Google OAuth is not configured. Provide Android client ID for native sign-in, or Web client ID + secret.',
    );
  }

  return {
    clientId: webClientId,
    clientSecret,
    clientType: 'web',
  };
}

function resolveOAuthClientForAccount(accountKey) {
  const account = getOAuthAccount(accountKey);
  if (!account) {
    throw new Error(`OAuth account not found: ${accountKey}`);
  }

  return resolveOAuthClient({
    clientId: account.oauthClientId,
    clientType: account.oauthClientType || 'android',
  });
}

async function exchangeAuthorizationCode({
  code,
  redirectUri,
  codeVerifier,
  clientId,
  clientType,
}) {
  const client = resolveOAuthClient({ clientId, clientType });

  const body = new URLSearchParams({
    code,
    client_id: client.clientId,
    grant_type: 'authorization_code',
  });

  if (redirectUri) {
    body.set('redirect_uri', redirectUri);
  }

  if (codeVerifier) {
    body.set('code_verifier', codeVerifier);
  }

  if (client.clientSecret) {
    body.set('client_secret', client.clientSecret);
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Google token exchange failed.');
  }

  return { payload, client };
}

async function refreshAccessToken(accountKey) {
  const account = getOAuthAccount(accountKey);
  if (!account?.refreshToken) {
    throw new Error(`No refresh token stored for account "${accountKey}".`);
  }

  const client = resolveOAuthClientForAccount(accountKey);
  const body = new URLSearchParams({
    client_id: client.clientId,
    refresh_token: account.refreshToken,
    grant_type: 'refresh_token',
  });

  if (client.clientSecret) {
    body.set('client_secret', client.clientSecret);
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Google token refresh failed.');
  }

  return updateOAuthTokens(accountKey, {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    scope: payload.scope,
  });
}

async function getValidAccessToken(accountKey) {
  const account = getOAuthAccount(accountKey);
  if (!account) {
    throw new Error(`OAuth account not found: ${accountKey}`);
  }

  const expiresSoon = account.expiresAt - Date.now() < 60_000;
  if (!expiresSoon && account.accessToken) {
    return account.accessToken;
  }

  const refreshed = await refreshAccessToken(accountKey);
  return refreshed.accessToken;
}

async function fetchGoogleProfile(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const profile = await response.json();
  if (!response.ok) {
    throw new Error(profile.error?.message || 'Failed to load Google profile.');
  }

  return profile;
}

async function completeGoogleOAuth({
  code,
  redirectUri,
  codeVerifier,
  clientId,
  clientType = 'android',
}) {
  const { payload, client } = await exchangeAuthorizationCode({
    code,
    redirectUri,
    codeVerifier,
    clientId,
    clientType,
  });

  const profile = await fetchGoogleProfile(payload.access_token);
  if (!profile.email) {
    throw new Error('Google profile did not include an email address.');
  }

  const saved = upsertOAuthAccount({
    email: profile.email,
    displayName: profile.name,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    scope: payload.scope,
    oauthClientId: client.clientId,
    oauthRedirectUri: redirectUri,
    oauthClientType: client.clientType,
  });

  return saved;
}

module.exports = {
  completeGoogleOAuth,
  getValidAccessToken,
  refreshAccessToken,
  exchangeAuthorizationCode,
};
