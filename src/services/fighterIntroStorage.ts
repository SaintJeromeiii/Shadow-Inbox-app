import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CharacterId } from '../types/character';

const SEEN_INTROS_KEY = '@shadow_inbox/fighter_intros_seen';

export async function loadSeenFighterIntros(): Promise<Set<CharacterId>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_INTROS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? (parsed as CharacterId[]) : []);
  } catch {
    return new Set();
  }
}

export async function markFighterIntroSeen(characterId: CharacterId): Promise<void> {
  const seen = await loadSeenFighterIntros();
  seen.add(characterId);
  await AsyncStorage.setItem(SEEN_INTROS_KEY, JSON.stringify([...seen]));
}
