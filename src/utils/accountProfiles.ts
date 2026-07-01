import type { AccountProfile } from '../types/account';

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * When the same inbox email appears as both a builtin relay account and a linked
 * Google OAuth account, keep the OAuth profile so sign-in state is obvious.
 */
export function dedupeAccountsByEmail(accounts: AccountProfile[]): AccountProfile[] {
  const byEmail = new Map<string, AccountProfile>();

  for (const account of accounts) {
    const email = normalizeAccountEmail(account.email);
    if (!email) continue;

    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, account);
      continue;
    }

    if (account.oauth && !existing.oauth) {
      byEmail.set(email, account);
    }
  }

  return [...byEmail.values()];
}

export function accountKeyForEmail(
  accounts: AccountProfile[],
  email: string,
): string | null {
  const normalized = normalizeAccountEmail(email);
  if (!normalized) return null;

  const matches = accounts.filter(
    (account) => normalizeAccountEmail(account.email) === normalized,
  );

  const oauthMatch = matches.find((account) => account.oauth);
  if (oauthMatch) {
    return oauthMatch.key;
  }

  return matches[0]?.key ?? null;
}

export function preferOAuthAccountKey(
  accounts: AccountProfile[],
  accountKey: string,
): string {
  const selected = accounts.find((account) => account.key === accountKey);
  if (!selected) {
    return accountKey;
  }

  const oauthSibling = accounts.find(
    (account) =>
      account.oauth &&
      normalizeAccountEmail(account.email) === normalizeAccountEmail(selected.email),
  );

  return oauthSibling?.key ?? accountKey;
}
