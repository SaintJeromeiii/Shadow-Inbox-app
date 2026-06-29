const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./supabaseClient');
const { resolveAccountKey } = require('./accounts');
const { DEFAULT_CHARACTER_ID, resolveCharacterId } = require('./characterIds');

const PROGRESS_PATH = path.join(__dirname, 'data', 'user_progress.json');

const PLAYER_TIERS = [
  { tier: 1, name: 'Street Civilian', minDeletions: 0 },
  { tier: 2, name: 'Cyber Soldier', minDeletions: 26 },
  { tier: 3, name: 'Neon Commando', minDeletions: 101 },
  { tier: 4, name: 'Shadow Realm Deity', minDeletions: 251 },
];

function progressStoreKey(accountKey, characterId) {
  return `${resolveAccountKey(accountKey)}:${resolveCharacterId(characterId)}`;
}

function readProgressStore() {
  try {
    const raw = fs.readFileSync(PROGRESS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeProgressStore(store) {
  fs.mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true });
  fs.writeFileSync(PROGRESS_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function getTierInfo(totalDeletions) {
  const count = Math.max(0, Number(totalDeletions) || 0);
  let current = PLAYER_TIERS[0];
  for (const tier of PLAYER_TIERS) {
    if (count >= tier.minDeletions) {
      current = tier;
    }
  }
  return current;
}

function getNextTierInfo(tier) {
  return PLAYER_TIERS.find((entry) => entry.tier === tier + 1) || null;
}

function buildPlayerStats(totalDeletions) {
  const count = Math.max(0, Number(totalDeletions) || 0);
  const tierInfo = getTierInfo(count);
  const nextTier = getNextTierInfo(tierInfo.tier);

  let progress = 1;
  let deletesToNext = 0;

  if (nextTier) {
    const span = nextTier.minDeletions - tierInfo.minDeletions;
    progress = span > 0 ? Math.min(1, (count - tierInfo.minDeletions) / span) : 0;
    deletesToNext = Math.max(0, nextTier.minDeletions - count);
  }

  return {
    totalDeletions: count,
    tier: tierInfo.tier,
    tierName: tierInfo.name,
    progress,
    deletesToNext,
    nextTier: nextTier?.tier ?? null,
    nextTierName: nextTier?.name ?? null,
    maxTier: !nextTier,
  };
}

function didLevelUp(previousCount, nextCount) {
  return getTierInfo(nextCount).tier > getTierInfo(previousCount).tier;
}

async function readTotalDeletions(accountKey, characterId = DEFAULT_CHARACTER_ID) {
  const resolved = resolveAccountKey(accountKey);
  const resolvedCharacterId = resolveCharacterId(characterId);
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('user_progress')
      .select('total_deletions')
      .eq('account_key', resolved)
      .eq('character_id', resolvedCharacterId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return Number(data?.total_deletions ?? 0);
  }

  const store = readProgressStore();
  return Number(store[progressStoreKey(resolved, resolvedCharacterId)]?.totalDeletions ?? 0);
}

async function writeTotalDeletions(
  accountKey,
  characterId = DEFAULT_CHARACTER_ID,
  totalDeletions,
) {
  const resolved = resolveAccountKey(accountKey);
  const resolvedCharacterId = resolveCharacterId(characterId);
  const count = Math.max(0, Number(totalDeletions) || 0);
  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase.from('user_progress').upsert(
      {
        account_key: resolved,
        character_id: resolvedCharacterId,
        total_deletions: count,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_key,character_id' },
    );

    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const store = readProgressStore();
  store[progressStoreKey(resolved, resolvedCharacterId)] = {
    totalDeletions: count,
    updatedAt: new Date().toISOString(),
  };
  writeProgressStore(store);
}

async function getPlayerStats(accountKey, characterId = DEFAULT_CHARACTER_ID) {
  const totalDeletions = await readTotalDeletions(accountKey, characterId);
  return buildPlayerStats(totalDeletions);
}

async function recordDeletions(accountKey, count = 1, characterId = DEFAULT_CHARACTER_ID) {
  const increment = Math.max(0, Number(count) || 0);
  if (increment === 0) {
    const stats = await getPlayerStats(accountKey, characterId);
    return { ...stats, leveledUp: false, previousTier: stats.tier };
  }

  const previousTotal = await readTotalDeletions(accountKey, characterId);
  const nextTotal = previousTotal + increment;
  const previousTier = getTierInfo(previousTotal).tier;

  await writeTotalDeletions(accountKey, characterId, nextTotal);

  const stats = buildPlayerStats(nextTotal);
  return {
    ...stats,
    leveledUp: didLevelUp(previousTotal, nextTotal),
    previousTier,
  };
}

module.exports = {
  PLAYER_TIERS,
  buildPlayerStats,
  getPlayerStats,
  recordDeletions,
  didLevelUp,
};
