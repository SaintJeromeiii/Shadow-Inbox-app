import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccountProfile } from '../types/account';

const HIDDEN_ACCOUNTS_KEY = '@shadow_inbox/hidden_accounts';
const LINKED_ACCOUNTS_CACHE_KEY = '@shadow_inbox/linked_accounts_cache';

export async function getHiddenAccountKeys(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(HIDDEN_ACCOUNTS_KEY);
  if (!raw) return new Set();

  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export async function hideAccountOnDevice(accountKey: string): Promise<void> {
  const hidden = await getHiddenAccountKeys();
  hidden.add(accountKey);
  await AsyncStorage.setItem(HIDDEN_ACCOUNTS_KEY, JSON.stringify([...hidden]));
}

export async function unhideAccountOnDevice(accountKey: string): Promise<void> {
  const hidden = await getHiddenAccountKeys();
  hidden.delete(accountKey);
  await AsyncStorage.setItem(HIDDEN_ACCOUNTS_KEY, JSON.stringify([...hidden]));
}

export async function cacheLinkedAccounts(accounts: AccountProfile[]): Promise<void> {
  const oauthAccounts = accounts.filter((account) => account.oauth);
  if (oauthAccounts.length === 0) {
    return;
  }

  await AsyncStorage.setItem(LINKED_ACCOUNTS_CACHE_KEY, JSON.stringify(oauthAccounts));
}

export async function readCachedLinkedAccounts(): Promise<AccountProfile[]> {
  const raw = await AsyncStorage.getItem(LINKED_ACCOUNTS_CACHE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AccountProfile[]) : [];
  } catch {
    return [];
  }
}

export async function clearCachedLinkedAccounts(): Promise<void> {
  await AsyncStorage.removeItem(LINKED_ACCOUNTS_CACHE_KEY);
}

/**
 * Merge relay accounts with the last known OAuth profiles so a Metro reload
 * still shows linked Google inboxes when the relay is briefly unreachable.
 */
export function mergeAccountsWithCache(
  remoteAccounts: AccountProfile[],
  cachedOAuthAccounts: AccountProfile[],
): AccountProfile[] {
  if (cachedOAuthAccounts.length === 0) {
    return remoteAccounts;
  }

  const merged = new Map<string, AccountProfile>();
  for (const account of remoteAccounts) {
    merged.set(account.key, account);
  }

  for (const cached of cachedOAuthAccounts) {
    if (!merged.has(cached.key)) {
      merged.set(cached.key, cached);
    }
  }

  return [...merged.values()];
}
