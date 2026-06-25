import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RawNotification, TriagedNotification } from '../types/notification';
import type { AccountKey } from '../types/account';
import { getSeedNotifications } from './notificationData';

function storageKey(accountKey: AccountKey): string {
  return `@shadow_inbox/triaged_notifications:${accountKey}`;
}

export async function loadPersistedNotifications(
  accountKey: AccountKey,
  seedOverride?: RawNotification[],
): Promise<TriagedNotification[]> {
  const seed = seedOverride ?? getSeedNotifications(accountKey);
  const raw = await AsyncStorage.getItem(storageKey(accountKey));

  if (!raw) {
    return seed.map((notification) => ({ ...notification }));
  }

  try {
    const persisted = JSON.parse(raw) as TriagedNotification[];
    return mergeWithSeed(seed, persisted);
  } catch (error) {
    console.warn('Failed to parse persisted notifications, using seed data:', error);
    return seed.map((notification) => ({ ...notification }));
  }
}

export async function saveNotifications(
  accountKey: AccountKey,
  notifications: TriagedNotification[],
): Promise<void> {
  await AsyncStorage.setItem(storageKey(accountKey), JSON.stringify(notifications));
}

export async function clearPersistedNotifications(
  accountKey: AccountKey,
): Promise<void> {
  await AsyncStorage.removeItem(storageKey(accountKey));
}

function mergeWithSeed(
  seed: RawNotification[],
  persisted: TriagedNotification[],
): TriagedNotification[] {
  const persistedById = new Map(persisted.map((item) => [item.id, item]));

  return seed.map((seedItem) => {
    const saved = persistedById.get(seedItem.id);
    if (!saved) {
      return { ...seedItem };
    }

    return {
      ...seedItem,
      triage: saved.triage ?? seedItem.triage,
      archived: saved.archived,
      shadowLabels: saved.shadowLabels ?? seedItem.shadowLabels,
      gmailMessageId: saved.gmailMessageId ?? seedItem.gmailMessageId,
      messageIdHeader: saved.messageIdHeader ?? seedItem.messageIdHeader,
    };
  });
}
