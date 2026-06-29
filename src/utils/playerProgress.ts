import type { PlayerStats, PlayerTier } from '../types/userProgress';
import { PLAYER_TIER_THRESHOLDS } from '../types/userProgress';

export function getTierFromDeletions(totalDeletions: number): PlayerTier {
  const count = Math.max(0, totalDeletions);
  if (count >= PLAYER_TIER_THRESHOLDS[4]) return 4;
  if (count >= PLAYER_TIER_THRESHOLDS[3]) return 3;
  if (count >= PLAYER_TIER_THRESHOLDS[2]) return 2;
  return 1;
}

export function buildPlayerStats(totalDeletions: number): PlayerStats {
  const count = Math.max(0, totalDeletions);
  const tier = getTierFromDeletions(count);
  const nextTier = tier < 4 ? ((tier + 1) as PlayerTier) : null;
  const tierMin = PLAYER_TIER_THRESHOLDS[tier];
  const nextMin = nextTier ? PLAYER_TIER_THRESHOLDS[nextTier] : null;

  let progress = 1;
  let deletesToNext = 0;

  if (nextMin != null) {
    const span = nextMin - tierMin;
    progress = span > 0 ? Math.min(1, (count - tierMin) / span) : 0;
    deletesToNext = Math.max(0, nextMin - count);
  }

  const tierNames: Record<PlayerTier, string> = {
    1: 'Street Civilian',
    2: 'Cyber Soldier',
    3: 'Neon Commando',
    4: 'Shadow Realm Deity',
  };

  return {
    totalDeletions: count,
    tier,
    tierName: tierNames[tier],
    progress,
    deletesToNext,
    nextTier,
    nextTierName: nextTier ? tierNames[nextTier] : null,
    maxTier: !nextTier,
  };
}

export function didLevelUp(previousCount: number, nextCount: number): boolean {
  return getTierFromDeletions(nextCount) > getTierFromDeletions(previousCount);
}

export function applyDeletionLocally(
  current: PlayerStats,
  count = 1,
): PlayerStats {
  const previousTier = current.tier;
  const next = buildPlayerStats(current.totalDeletions + count);
  return {
    ...next,
    leveledUp: didLevelUp(current.totalDeletions, next.totalDeletions),
    previousTier,
  };
}
