import type { VisualTier } from '../types/character';
import type { PlayerTier } from '../types/userProgress';
import { getStageDifficulty } from './stageDifficulty';

/**
 * Maps lifetime clear count (player tier) → armor sprite tier on the profile card.
 */
export function getVisualTierFromPlayerTier(
  playerTier: PlayerTier,
  maxVisualTier: VisualTier = 3,
): VisualTier {
  const mapped = Math.min(Math.max(playerTier, 1), 3) as VisualTier;
  return Math.min(mapped, maxVisualTier) as VisualTier;
}

/**
 * Maps inbox signal count → visual sprite tier for stage difficulty banners.
 * Easy Peasy → 1, Beginner → 2, Intermediate → 2, Boss Level → 3.
 */
export function getVisualTierFromInboxCount(
  inboxCount: number,
  maxVisualTier: VisualTier = 3,
): VisualTier {
  const difficulty = getStageDifficulty(inboxCount).label;
  let tier: VisualTier;

  switch (difficulty) {
    case 'BOSS LEVEL':
      tier = 3;
      break;
    case 'INTERMEDIATE':
    case 'BEGINNER':
      tier = 2;
      break;
    case 'EASY PEASY':
    default:
      tier = 1;
      break;
  }

  return Math.min(tier, maxVisualTier) as VisualTier;
}
