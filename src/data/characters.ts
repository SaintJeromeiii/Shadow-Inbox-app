import {
  CHARACTER_REGISTRY,
  DEFAULT_CHARACTER_ID,
  getCharacterRegistryEntry,
  normalizeCharacterId,
} from '../constants/characters';
import type { CharacterId, PlayableCharacter } from '../types/character';

export { DEFAULT_CHARACTER_ID, normalizeCharacterId };

export const PLAYABLE_CHARACTERS: PlayableCharacter[] = CHARACTER_REGISTRY.filter(
  (entry) => entry.unlocked,
).map((entry) => ({
  id: entry.id,
  codename: entry.codename,
  startingTierTitle: entry.tiers[1]?.label ?? 'OPERATIVE',
  tagline: entry.tagline,
  unlocked: entry.unlocked,
  ethnicity: entry.ethnicity,
  gender: entry.gender,
  maxVisualTier: entry.maxVisualTier,
}));

export const LOCKED_ROSTER_SLOTS = 0;
export const SHOW_COMING_SOON_FIGHTERS = false;

export function getCharacterById(id: CharacterId): PlayableCharacter {
  const entry = getCharacterRegistryEntry(id);
  return {
    id: entry.id,
    codename: entry.codename,
    startingTierTitle: entry.tiers[1]?.label ?? 'OPERATIVE',
    tagline: entry.tagline,
    unlocked: entry.unlocked,
    ethnicity: entry.ethnicity,
    gender: entry.gender,
    maxVisualTier: entry.maxVisualTier,
  };
}
