import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CHARACTER_ID, normalizeCharacterId } from '../constants/characters';
import { getCharacterById } from '../data/characters';
import type { CharacterId } from '../types/character';

const STORAGE_KEY = 'shadow_inbox_selected_character';

export async function loadSelectedCharacterId(): Promise<CharacterId> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeCharacterId(raw);
    }
  } catch (error) {
    console.warn('[CharacterStorage] Failed to load selection:', error);
  }
  return DEFAULT_CHARACTER_ID;
}

export async function saveSelectedCharacterId(characterId: CharacterId): Promise<void> {
  getCharacterById(characterId);
  await AsyncStorage.setItem(STORAGE_KEY, characterId);
}
