import type { AccountKey } from '../types/account';
import type { CharacterId } from '../types/character';
import { getUnlockedCharacterIds } from '../constants/characters';
import type { PlayerStats } from '../types/userProgress';
import { buildPlayerStats } from '../utils/playerProgress';
import {
  getActiveAccountKey,
  getActiveCharacterId,
  relayFetch,
} from './emailService';
import {
  loadLocalCharacterDeletions,
  saveLocalCharacterDeletions,
} from './characterProgressStorage';

const PLAYER_STATS_CACHE_TTL_MS = 30_000;

type PlayerStatsCacheEntry = {
  stats: PlayerStats;
  fetchedAt: number;
};

const playerStatsCache = new Map<string, PlayerStatsCacheEntry>();

function playerStatsCacheKey(accountKey: AccountKey, characterId: CharacterId): string {
  return `${accountKey}:${characterId}`;
}

function getCachedPlayerStats(
  accountKey: AccountKey,
  characterId: CharacterId,
  maxAgeMs = PLAYER_STATS_CACHE_TTL_MS,
): PlayerStats | null {
  const entry = playerStatsCache.get(playerStatsCacheKey(accountKey, characterId));
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.fetchedAt > maxAgeMs) {
    playerStatsCache.delete(playerStatsCacheKey(accountKey, characterId));
    return null;
  }

  return entry.stats;
}

function setCachedPlayerStats(
  accountKey: AccountKey,
  characterId: CharacterId,
  stats: PlayerStats,
): PlayerStats {
  playerStatsCache.set(playerStatsCacheKey(accountKey, characterId), {
    stats,
    fetchedAt: Date.now(),
  });
  return stats;
}

async function parseJson<T extends { error?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) {
      throw new Error(`Relay error (${response.status})`);
    }
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      response.ok
        ? 'Relay returned a non-JSON response.'
        : `Relay error (${response.status})`,
    );
  }
}

async function loadStatsWithLocalFallback(
  accountKey: AccountKey,
  characterId: CharacterId,
): Promise<PlayerStats> {
  const localDeletions = await loadLocalCharacterDeletions(accountKey, characterId);
  return buildPlayerStats(localDeletions);
}

export async function fetchPlayerStats(
  accountKey: AccountKey = getActiveAccountKey(),
  characterId: CharacterId = getActiveCharacterId(),
  options: { force?: boolean; maxAgeMs?: number } = {},
): Promise<PlayerStats> {
  if (!accountKey) {
    return loadStatsWithLocalFallback(accountKey, characterId);
  }

  const { force = false, maxAgeMs = PLAYER_STATS_CACHE_TTL_MS } = options;
  if (!force) {
    const cached = getCachedPlayerStats(accountKey, characterId, maxAgeMs);
    if (cached) {
      return cached;
    }
  }

  const response = await relayFetch(
    `/api/user/stats?accountKey=${encodeURIComponent(accountKey)}&characterId=${encodeURIComponent(characterId)}`,
    {
      method: 'GET',
      headers: {
        'X-Account-Key': accountKey,
        'X-Character-Id': characterId,
      },
    },
  );

  const data = await parseJson<{ stats?: PlayerStats; error?: string }>(response);
  if (!response.ok || !data.stats) {
    return setCachedPlayerStats(
      accountKey,
      characterId,
      await loadStatsWithLocalFallback(accountKey, characterId),
    );
  }

  await saveLocalCharacterDeletions(accountKey, characterId, data.stats.totalDeletions);
  return setCachedPlayerStats(accountKey, characterId, data.stats);
}

export async function recordPlayerDeletion(
  count = 1,
  accountKey: AccountKey = getActiveAccountKey(),
  characterId: CharacterId = getActiveCharacterId(),
): Promise<PlayerStats> {
  if (!accountKey) {
    const localDeletions = await loadLocalCharacterDeletions(accountKey, characterId);
    const nextDeletions = localDeletions + Math.max(0, count);
    await saveLocalCharacterDeletions(accountKey, characterId, nextDeletions);
    return setCachedPlayerStats(accountKey, characterId, buildPlayerStats(nextDeletions));
  }

  const response = await relayFetch('/api/user/stats/deletion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Account-Key': accountKey,
      'X-Character-Id': characterId,
    },
    body: JSON.stringify({ count, accountKey, characterId }),
  });

  const data = await parseJson<{ stats?: PlayerStats; error?: string }>(response);
  if (!response.ok || !data.stats) {
    const localDeletions = await loadLocalCharacterDeletions(accountKey, characterId);
    const nextDeletions = localDeletions + Math.max(0, count);
    await saveLocalCharacterDeletions(accountKey, characterId, nextDeletions);
    return setCachedPlayerStats(accountKey, characterId, buildPlayerStats(nextDeletions));
  }

  await saveLocalCharacterDeletions(accountKey, characterId, data.stats.totalDeletions);
  return setCachedPlayerStats(accountKey, characterId, data.stats);
}

export async function fetchAllCharacterStats(
  accountKey: AccountKey = getActiveAccountKey(),
  characterIds: CharacterId[] = getUnlockedCharacterIds(),
): Promise<Partial<Record<CharacterId, PlayerStats>>> {
  if (!accountKey) {
    const entries = await Promise.all(
      characterIds.map(async (characterId) => {
        const stats = await loadStatsWithLocalFallback(accountKey, characterId);
        return [characterId, stats] as const;
      }),
    );

    return Object.fromEntries(entries) as Partial<Record<CharacterId, PlayerStats>>;
  }

  const entries = await Promise.all(
    characterIds.map(async (characterId) => {
      const stats = await fetchPlayerStats(accountKey, characterId);
      return [characterId, stats] as const;
    }),
  );

  return Object.fromEntries(entries) as Partial<Record<CharacterId, PlayerStats>>;
}
