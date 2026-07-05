import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const DEVICE_INSTALL_ID_KEY = '@shadow_inbox/device_install_id';

let cachedDeviceInstallId: string | null = null;

export function getCachedDeviceInstallId(): string {
  return cachedDeviceInstallId ?? '';
}

function createInstallId(): string {
  return Crypto.randomUUID();
}

export async function getDeviceInstallId(): Promise<string> {
  if (cachedDeviceInstallId) {
    return cachedDeviceInstallId;
  }

  const existing = await AsyncStorage.getItem(DEVICE_INSTALL_ID_KEY);
  if (existing?.trim()) {
    cachedDeviceInstallId = existing.trim();
    return cachedDeviceInstallId;
  }

  const nextId = createInstallId();
  await AsyncStorage.setItem(DEVICE_INSTALL_ID_KEY, nextId);
  cachedDeviceInstallId = nextId;
  return nextId;
}

export async function ensureDeviceInstallId(): Promise<string> {
  return getDeviceInstallId();
}
