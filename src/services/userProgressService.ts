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
): Promise<PlayerStats> {
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
    return loadStatsWithLocalFallback(accountKey, characterId);
  }

  await saveLocalCharacterDeletions(accountKey, characterId, data.stats.totalDeletions);
  return data.stats;
}

export async function recordPlayerDeletion(
  count = 1,
  accountKey: AccountKey = getActiveAccountKey(),
  characterId: CharacterId = getActiveCharacterId(),
): Promise<PlayerStats> {
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
    return buildPlayerStats(nextDeletions);
  }

  await saveLocalCharacterDeletions(accountKey, characterId, data.stats.totalDeletions);
  return data.stats;
}

export async function fetchAllCharacterStats(
  accountKey: AccountKey = getActiveAccountKey(),
  characterIds: CharacterId[] = getUnlockedCharacterIds(),
): Promise<Partial<Record<CharacterId, PlayerStats>>> {
  const entries = await Promise.all(
    characterIds.map(async (characterId) => {
      const stats = await fetchPlayerStats(accountKey, characterId);
      return [characterId, stats] as const;
    }),
  );

  return Object.fromEntries(entries) as Partial<Record<CharacterId, PlayerStats>>;
}
