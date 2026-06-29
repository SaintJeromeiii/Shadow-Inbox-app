import type { VisualTier } from '../types/character';
import { getStageDifficulty } from './stageDifficulty';

/**
 * Maps inbox signal count → visual sprite tier for the avatar engine.
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
