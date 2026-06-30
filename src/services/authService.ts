import type { AccountProfile } from '../types/account';
import { relayFetch } from './emailService';

export type GoogleOAuthClientType = 'android' | 'web';

export interface GoogleAuthCallbackResult {
  success: boolean;
  account?: AccountProfile;
  accountKey?: string;
  error?: string;
}

async function parseRelayJson<T extends { error?: string }>(
  response: Response,
): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    if (!response.ok) {
      throw new Error(`Relay error (${response.status})`);
    }
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 140);
    throw new Error(
      response.ok
        ? 'Relay returned a non-JSON response. Restart npm run dev:backend on your Mac.'
        : `Relay error (${response.status}): ${preview}`,
    );
  }
}

export async function fetchRelayAccounts(): Promise<AccountProfile[]> {
  const response = await relayFetch('/api/accounts', { method: 'GET' });

  if (!response.ok) {
    throw new Error(`Failed to load accounts (${response.status})`);
  }

  const data = await parseRelayJson<{ accounts?: AccountProfile[] }>(response);
  return data.accounts ?? [];
}

export async function removeRelayAccount(
  accountKey: string,
): Promise<{ success: boolean; accounts?: AccountProfile[]; error?: string }> {
  const response = await relayFetch('/api/accounts/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountKey }),
  });

  const data = await parseRelayJson<{
    success?: boolean;
    accounts?: AccountProfile[];
    error?: string;
  }>(response);

  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? `Failed to remove account (${response.status})`,
    };
  }

  return {
    success: true,
    accounts: data.accounts,
  };
}

export async function exchangeGoogleAuthCode(input: {
  code: string;
  redirectUri?: string;
  codeVerifier?: string;
  clientId?: string;
  clientType?: GoogleOAuthClientType;
}): Promise<GoogleAuthCallbackResult> {
  const OAUTH_TIMEOUT_MS = 45_000;

  try {
    const response = await relayFetch(
      '/api/auth/google/callback',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      OAUTH_TIMEOUT_MS,
    );

    const data = await parseRelayJson<GoogleAuthCallbackResult & { error?: string }>(
      response,
    );

    if (!response.ok) {
      return {
        success: false,
        error: data.error ?? `OAuth callback failed (${response.status})`,
      };
    }

    return {
      success: true,
      account: data.account,
      accountKey: data.accountKey,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OAuth callback failed.',
    };
  }
}
