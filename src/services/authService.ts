import type { AccountProfile } from '../types/account';
import { getRelayUrl } from './emailService';

export type GoogleOAuthClientType = 'android' | 'web';

export interface GoogleAuthCallbackResult {
  success: boolean;
  account?: AccountProfile;
  accountKey?: string;
  error?: string;
}

export async function fetchRelayAccounts(): Promise<AccountProfile[]> {
  const response = await fetch(`${getRelayUrl()}/api/accounts`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to load accounts (${response.status})`);
  }

  const data = (await response.json()) as { accounts?: AccountProfile[] };
  return data.accounts ?? [];
}

export async function exchangeGoogleAuthCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  clientId?: string;
  clientType?: GoogleOAuthClientType;
}): Promise<GoogleAuthCallbackResult> {
  const response = await fetch(`${getRelayUrl()}/api/auth/google/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as GoogleAuthCallbackResult & {
    error?: string;
  };

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
}
