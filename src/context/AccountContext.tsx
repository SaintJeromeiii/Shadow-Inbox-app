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
import { getHiddenAccountKeys } from '../services/accountStorage';
import { setActiveAccountKey } from '../services/emailService';
import type { AccountKey, AccountProfile } from '../types/account';

const STORAGE_KEY = '@shadow_inbox/active_account';

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
    try {
      const [remoteAccounts, hidden] = await Promise.all([
        fetchRelayAccounts(),
        getHiddenAccountKeys(),
      ]);

      if (remoteAccounts.length > 0) {
        const visible = remoteAccounts.filter((account) => !hidden.has(account.key));
        setAccounts(visible);
        return visible;
      }
    } catch (error) {
      console.warn('[Shadow Inbox] Could not load accounts from relay:', error);
    }

    const hidden = await getHiddenAccountKeys();
    const visibleBuiltin = BUILTIN_ACCOUNT_PROFILES.filter(
      (account) => !hidden.has(account.key),
    );
    setAccounts(visibleBuiltin);
    return visibleBuiltin;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAccount() {
      const [saved, remoteAccounts] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        refreshAccounts().catch(() => BUILTIN_ACCOUNT_PROFILES),
      ]);

      if (cancelled) return;

      const available = remoteAccounts.length > 0 ? remoteAccounts : BUILTIN_ACCOUNT_PROFILES;
      const hidden = await getHiddenAccountKeys();
      const visible = available.filter((account) => !hidden.has(account.key));
      const initialAccount =
        saved &&
        visible.some((account) => account.key === saved)
          ? saved
          : visible[0]?.key ?? 'personal';

      setActiveAccountState(initialAccount);
      setActiveAccountKey(initialAccount);
      setReady(true);
    }

    void hydrateAccount();

    return () => {
      cancelled = true;
    };
  }, [refreshAccounts]);

  const setActiveAccount = useCallback(async (accountKey: AccountKey) => {
    setActiveAccountState(accountKey);
    setActiveAccountKey(accountKey);
    await AsyncStorage.setItem(STORAGE_KEY, accountKey);
  }, []);

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
