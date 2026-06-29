import type { ImageSourcePropType } from 'react-native';

export type CharacterId =
  | 'black_male'
  | 'robot_neutral'
  | 'quantum_neutral'
  | 'asian_male'
  | 'asian_female'
  | 'white_male'
  | 'white_female'
  | 'indian_male'
  | 'indian_female';

/** Visual sprite tier (1–3) driven by inbox difficulty, not XP level. */
export type VisualTier = 1 | 2 | 3;

export type CharacterEthnicity =
  | 'Black'
  | 'Asian'
  | 'White'
  | 'Indian'
  | 'Robot'
  | 'Quantum';
export type CharacterGender = 'male' | 'female' | 'neutral';

export interface CharacterVisualTierAssets {
  still: ImageSourcePropType;
  intro?: number;
  label: string;
}

export interface CharacterRegistryEntry {
  id: CharacterId;
  codename: string;
  ethnicity: CharacterEthnicity;
  gender: CharacterGender;
  tagline: string;
  unlocked: boolean;
  comingSoon?: boolean;
  /** Highest visual tier this character has assets for (Quantum = 2). */
  maxVisualTier: VisualTier;
  tiers: Partial<Record<VisualTier, CharacterVisualTierAssets>>;
}

export interface PlayableCharacter {
  id: CharacterId;
  codename: string;
  startingTierTitle: string;
  tagline: string;
  unlocked: boolean;
  ethnicity: CharacterEthnicity;
  gender: CharacterGender;
  maxVisualTier: VisualTier;
}
