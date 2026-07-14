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
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('Persisted notifications were not an array, using seed data.');
      return seed.map((notification) => ({ ...notification }));
    }
    return mergeWithSeed(seed, parsed as TriagedNotification[]);
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

function dedupeNotificationsById<T extends { id: string }>(items: T[]): T[] {
  if (!Array.isArray(items)) {
    return [];
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function mergeWithSeed(
  seed: RawNotification[],
  persisted: TriagedNotification[],
): TriagedNotification[] {
  const safeSeed = Array.isArray(seed) ? seed : [];
  const safePersisted = Array.isArray(persisted) ? persisted : [];
  const persistedById = new Map(safePersisted.map((item) => [item.id, item]));

  return dedupeNotificationsById(safeSeed).map((seedItem) => {
    const saved = persistedById.get(seedItem.id);
    if (!saved) {
      return { ...seedItem };
    }

    return {
      ...seedItem,
      triage: saved.triage ?? seedItem.triage,
      archived: saved.archived,
      snoozedUntil: saved.snoozedUntil,
      resurfacedFromSnooze: saved.resurfacedFromSnooze,
      reasonLabel: saved.reasonLabel ?? seedItem.reasonLabel,
      shadowLabels: saved.shadowLabels ?? seedItem.shadowLabels,
      gmailMessageId: saved.gmailMessageId ?? seedItem.gmailMessageId,
      messageIdHeader: saved.messageIdHeader ?? seedItem.messageIdHeader,
      channelName: saved.channelName ?? seedItem.channelName,
      replyTarget: saved.replyTarget ?? seedItem.replyTarget,
    };
  });
}
