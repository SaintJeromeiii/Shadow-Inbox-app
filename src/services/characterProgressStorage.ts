import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccountKey } from '../types/account';
import type { CharacterId } from '../types/character';

function storageKey(accountKey: AccountKey, characterId: CharacterId) {
  return `shadow_inbox_progress_${accountKey}_${characterId}`;
}

export async function loadLocalCharacterDeletions(
  accountKey: AccountKey,
  characterId: CharacterId,
): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(accountKey, characterId));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { totalDeletions?: number };
    return Math.max(0, Number(parsed.totalDeletions ?? 0));
  } catch {
    return 0;
  }
}

export async function saveLocalCharacterDeletions(
  accountKey: AccountKey,
  characterId: CharacterId,
  totalDeletions: number,
): Promise<void> {
  await AsyncStorage.setItem(
    storageKey(accountKey, characterId),
    JSON.stringify({
      totalDeletions: Math.max(0, Number(totalDeletions) || 0),
      updatedAt: new Date().toISOString(),
    }),
  );
}
