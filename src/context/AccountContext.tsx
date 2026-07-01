import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BUILTIN_ACCOUNT_PROFILES,
  findAccountProfile,
} from '../constants/accounts';
import { fetchRelayAccounts } from '../services/authService';
import {
  cacheLinkedAccounts,
  getHiddenAccountKeys,
  mergeAccountsWithCache,
  readCachedLinkedAccounts,
} from '../services/accountStorage';
import { setActiveAccountKey } from '../services/emailService';
import {
  accountKeyForEmail,
  dedupeAccountsByEmail,
  preferOAuthAccountKey,
} from '../utils/accountProfiles';
import type { AccountKey, AccountProfile } from '../types/account';

const STORAGE_KEY = '@shadow_inbox/active_account';
const DEV_FALLBACK_EMAIL = 'jleonandersonjr@gmail.com';

function filterVisibleAccounts(
  accounts: AccountProfile[],
  hidden: Set<string>,
): AccountProfile[] {
  return dedupeAccountsByEmail(
    accounts.filter((account) => !hidden.has(account.key) && !account.mockOnly),
  );
}

interface AccountContextValue {
  activeAccount: AccountKey;
  activeProfile: AccountProfile;
  accounts: AccountProfile[];
  ready: boolean;
  refreshAccounts: () => Promise<AccountProfile[]>;
  setActiveAccount: (accountKey: AccountKey) => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [activeAccount, setActiveAccountState] = useState<AccountKey>('personal');
  const [accounts, setAccounts] = useState<AccountProfile[]>(BUILTIN_ACCOUNT_PROFILES);
  const [ready, setReady] = useState(false);

  const refreshAccounts = useCallback(async () => {
    const [hidden, cachedOAuth] = await Promise.all([
      getHiddenAccountKeys(),
      readCachedLinkedAccounts(),
    ]);

    try {
      const remoteAccounts = await fetchRelayAccounts();
      const merged = mergeAccountsWithCache(remoteAccounts, cachedOAuth);
      const visible = filterVisibleAccounts(merged, hidden);

      if (visible.length > 0) {
        setAccounts(visible);
        await cacheLinkedAccounts(visible);
        return visible;
      }
    } catch (error) {
      console.warn('[Shadow Inbox] Could not load accounts from relay:', error);
    }

    const fallback = filterVisibleAccounts(
      mergeAccountsWithCache(BUILTIN_ACCOUNT_PROFILES, cachedOAuth),
      hidden,
    );
    setAccounts(fallback);
    return fallback;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAccount() {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      let visible: AccountProfile[];

      try {
        visible = await refreshAccounts();
      } catch {
        const hidden = await getHiddenAccountKeys();
        visible = filterVisibleAccounts(BUILTIN_ACCOUNT_PROFILES, hidden);
      }

      if (cancelled) return;

      const devFallbackAccountKey = __DEV__
        ? accountKeyForEmail(visible, DEV_FALLBACK_EMAIL)
        : null;

      const savedAccountKey =
        saved && visible.some((account) => account.key === saved)
          ? preferOAuthAccountKey(visible, saved)
          : null;

      const initialAccount =
        savedAccountKey ??
        devFallbackAccountKey ??
        visible[0]?.key ??
        'personal';

      if (__DEV__ && !accountKeyForEmail(visible, DEV_FALLBACK_EMAIL)) {
        console.warn(
          `[Shadow Inbox] Dev fallback email not linked yet: ${DEV_FALLBACK_EMAIL}`,
        );
      }

      setActiveAccountState(initialAccount);
      setActiveAccountKey(initialAccount);
      setReady(true);
    }

    void hydrateAccount();

    return () => {
      cancelled = true;
    };
  }, [refreshAccounts]);

  const setActiveAccount = useCallback(
    async (accountKey: AccountKey) => {
      const resolvedKey = preferOAuthAccountKey(accounts, accountKey);
      setActiveAccountState(resolvedKey);
      setActiveAccountKey(resolvedKey);
      await AsyncStorage.setItem(STORAGE_KEY, resolvedKey);
    },
    [accounts],
  );

  const value = useMemo<AccountContextValue>(
    () => ({
      activeAccount,
      activeProfile: findAccountProfile(activeAccount, accounts),
      accounts,
      ready,
      refreshAccounts,
      setActiveAccount,
    }),
    [activeAccount, accounts, ready, refreshAccounts, setActiveAccount],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccount must be used within AccountProvider');
  }
  return context;
}
