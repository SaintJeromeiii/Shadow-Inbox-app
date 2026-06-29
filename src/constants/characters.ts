import type {
  CharacterId,
  CharacterRegistryEntry,
  CharacterVisualTierAssets,
  VisualTier,
} from '../types/character';

export const DEFAULT_CHARACTER_ID: CharacterId = 'black_male';

export const CHARACTER_REGISTRY: CharacterRegistryEntry[] = [
  {
    id: 'black_male',
    codename: 'NEON WARDEN',
    ethnicity: 'Black',
    gender: 'male',
    tagline: 'First on the beat. Last in the shadows.',
    unlocked: true,
    maxVisualTier: 3,
    tiers: {
      1: {
        still: require('../../assets/images/black_male_tier1_still.png'),
        intro: require('../../assets/images/black_male_tier1_intro.mp4'),
        label: 'STREET CIVILIAN',
      },
      2: {
        still: require('../../assets/images/black_male_tier2_still.png'),
        label: 'CYBER SOLDIER',
      },
      3: {
        still: require('../../assets/images/black_male_tier3_still.png'),
        label: 'NEON COMMANDO',
      },
    },
  },
  {
    id: 'robot_neutral',
    codename: 'GRID STALKER',
    ethnicity: 'Robot',
    gender: 'neutral',
    tagline: 'Forged in the firewall. Built to purge spam.',
    unlocked: true,
    maxVisualTier: 3,
    tiers: {
      1: {
        still: require('../../assets/images/robot_neutral_tier1_still.png'),
        intro: require('../../assets/images/robot_neutral_tier1_intro.mp4'),
        label: 'PATROL DRONE',
      },
      2: {
        still: require('../../assets/images/robot_neutral_tier2_still.png'),
        intro: require('../../assets/images/robot_neutral_tier2_intro.mp4'),
        label: 'CYBER SOLDIER',
      },
      3: {
        still: require('../../assets/images/robot_neutral_tier3_still.png'),
        intro: require('../../assets/images/robot_neutral_tier3_intro.mp4'),
        label: 'ERADICATOR',
      },
    },
  },
  {
    id: 'quantum_neutral',
    codename: 'VOID SINGULARITY',
    ethnicity: 'Quantum',
    gender: 'neutral',
    tagline: 'Probability collapsed. Only clearance remains.',
    unlocked: true,
    maxVisualTier: 2,
    tiers: {
      1: {
        still: require('../../assets/images/quantum_neutral_tier1_still.png'),
        intro: require('../../assets/images/quantum_neutral_tier1_intro.mp4'),
        label: 'SINGULARITY',
      },
      2: {
        still: require('../../assets/images/quantum_neutral_tier2_still.png'),
        intro: require('../../assets/images/quantum_neutral_tier2_intro.mp4'),
        label: 'ERADICATOR',
      },
    },
  },
  {
    id: 'asian_male',
    codename: 'SHADOW RONIN',
    ethnicity: 'Asian',
    gender: 'male',
    tagline: 'Assets not yet deployed to the arcade.',
    unlocked: false,
    comingSoon: true,
    maxVisualTier: 1,
    tiers: {},
  },
  {
    id: 'asian_female',
    codename: 'PULSE SWIFT',
    ethnicity: 'Asian',
    gender: 'female',
    tagline: 'Assets not yet deployed to the arcade.',
    unlocked: false,
    comingSoon: true,
    maxVisualTier: 1,
    tiers: {},
  },
  {
    id: 'white_male',
    codename: 'FROST RUNNER',
    ethnicity: 'White',
    gender: 'male',
    tagline: 'Assets not yet deployed to the arcade.',
    unlocked: false,
    comingSoon: true,
    maxVisualTier: 1,
    tiers: {},
  },
  {
    id: 'white_female',
    codename: 'GLITCH PHANTOM',
    ethnicity: 'White',
    gender: 'female',
    tagline: 'Assets not yet deployed to the arcade.',
    unlocked: false,
    comingSoon: true,
    maxVisualTier: 1,
    tiers: {},
  },
  {
    id: 'indian_male',
    codename: 'VOLT GUARDIAN',
    ethnicity: 'Indian',
    gender: 'male',
    tagline: 'Assets not yet deployed to the arcade.',
    unlocked: false,
    comingSoon: true,
    maxVisualTier: 1,
    tiers: {},
  },
  {
    id: 'indian_female',
    codename: 'NEXUS WARDEN',
    ethnicity: 'Indian',
    gender: 'female',
    tagline: 'Assets not yet deployed to the arcade.',
    unlocked: false,
    comingSoon: true,
    maxVisualTier: 1,
    tiers: {},
  },
];

const REGISTRY_BY_ID = Object.fromEntries(
  CHARACTER_REGISTRY.map((entry) => [entry.id, entry]),
) as Record<CharacterId, CharacterRegistryEntry>;

const LEGACY_CHARACTER_IDS: Record<string, CharacterId> = {
  neon_warden: 'black_male',
};

export function normalizeCharacterId(raw: string | null | undefined): CharacterId {
  const id = String(raw || '').trim();
  if (id in REGISTRY_BY_ID) {
    return id as CharacterId;
  }
  if (id in LEGACY_CHARACTER_IDS) {
    return LEGACY_CHARACTER_IDS[id];
  }
  return DEFAULT_CHARACTER_ID;
}

export function getCharacterRegistryEntry(
  characterId: CharacterId,
): CharacterRegistryEntry {
  return REGISTRY_BY_ID[characterId] ?? REGISTRY_BY_ID[DEFAULT_CHARACTER_ID];
}

export function getUnlockedCharacters(): CharacterRegistryEntry[] {
  return CHARACTER_REGISTRY.filter((entry) => entry.unlocked);
}

export function getComingSoonCharacters(): CharacterRegistryEntry[] {
  return CHARACTER_REGISTRY.filter((entry) => entry.comingSoon || !entry.unlocked);
}

export function getUnlockedCharacterIds(): CharacterId[] {
  return getUnlockedCharacters().map((entry) => entry.id);
}

export function getFullRankingRoster(): CharacterRegistryEntry[] {
  return [...CHARACTER_REGISTRY];
}

export function getCharacterVisualTierAssets(
  characterId: CharacterId,
  visualTier: VisualTier,
): CharacterVisualTierAssets {
  const entry = getCharacterRegistryEntry(characterId);
  const clampedTier = Math.min(visualTier, entry.maxVisualTier) as VisualTier;
  const tierAssets = entry.tiers[clampedTier];

  if (tierAssets) {
    return tierAssets;
  }

  const fallbackTier = (entry.maxVisualTier as VisualTier) ?? 1;
  return (
    entry.tiers[fallbackTier] ??
    entry.tiers[1] ?? {
      still: require('../../assets/images/black_male_tier1_still.png'),
      label: 'UNKNOWN',
    }
  );
}

export function listVisualTiersForCharacter(characterId: CharacterId): VisualTier[] {
  const entry = getCharacterRegistryEntry(characterId);
  return ([1, 2, 3] as VisualTier[]).filter(
    (tier) => tier <= entry.maxVisualTier && entry.tiers[tier] != null,
  );
}
