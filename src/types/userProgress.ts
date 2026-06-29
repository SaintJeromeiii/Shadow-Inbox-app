export type PlayerTier = 1 | 2 | 3 | 4;

export interface PlayerStats {
  totalDeletions: number;
  tier: PlayerTier;
  tierName: string;
  progress: number;
  deletesToNext: number;
  nextTier: PlayerTier | null;
  nextTierName: string | null;
  maxTier: boolean;
  leveledUp?: boolean;
  previousTier?: PlayerTier;
}

export const PLAYER_TIER_NAMES: Record<PlayerTier, string> = {
  1: 'Street Civilian',
  2: 'Cyber Soldier',
  3: 'Neon Commando',
  4: 'Shadow Realm Deity',
};

export const PLAYER_TIER_THRESHOLDS: Record<PlayerTier, number> = {
  1: 0,
  2: 26,
  3: 101,
  4: 251,
};
