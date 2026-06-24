import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RawNotification, TriagedNotification } from '../types/notification';
import { getSeedNotifications } from './notificationData';

const STORAGE_KEY = '@shadow_inbox/triaged_notifications';

export async function loadPersistedNotifications(): Promise<TriagedNotification[]> {
  const seed = getSeedNotifications();
  const raw = await AsyncStorage.getItem(STORAGE_KEY);

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
  notifications: TriagedNotification[],
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
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
      triage: saved.triage,
      archived: saved.archived,
    };
  });
}
