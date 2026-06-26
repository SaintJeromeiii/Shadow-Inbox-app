import AsyncStorage from '@react-native-async-storage/async-storage';

const HIDDEN_ACCOUNTS_KEY = '@shadow_inbox/hidden_accounts';

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
