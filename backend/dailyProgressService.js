const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./supabaseClient');
const { resolveAccountKey } = require('./accounts');
const { getUserProfile, upsertUserProfile } = require('./userProfileService');

const PROGRESS_PATH = path.join(__dirname, 'data', 'daily_progress.json');
const DEFAULT_DAILY_GOAL = Number(process.env.DAILY_CLEARANCE_GOAL || 10);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readLocalProgressStore() {
  try {
    const raw = fs.readFileSync(PROGRESS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalProgressStore(store) {
  fs.mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true });
  fs.writeFileSync(PROGRESS_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function buildEngagement(profile, localFallback = null) {
  const today = todayKey();
  const lastClearDate = profile.lastClearDate || localFallback?.lastClearDate || null;
  let clearsToday = Number(profile.clearsToday ?? localFallback?.clearsToday ?? 0);
  let streakDays = Number(profile.streakDays ?? localFallback?.streakDays ?? 0);

  if (lastClearDate !== today) {
    clearsToday = 0;
  }

  const dailyGoal = Number(profile.dailyGoal ?? localFallback?.dailyGoal ?? DEFAULT_DAILY_GOAL);

  return {
    dailyGoal,
    clearsToday,
    streakDays,
    lastClearDate,
    goalMet: clearsToday >= dailyGoal,
    progress: dailyGoal > 0 ? Math.min(1, clearsToday / dailyGoal) : 0,
  };
}

async function getDailyEngagement(accountKey) {
  const resolved = resolveAccountKey(accountKey);
  const profile = await getUserProfile(resolved);
  const local = readLocalProgressStore()[resolved];
  return buildEngagement(
    {
      dailyGoal: profile.dailyGoal,
      clearsToday: profile.clearsToday,
      streakDays: profile.streakDays,
      lastClearDate: profile.lastClearDate,
    },
    local,
  );
}

async function recordClearance(accountKey, count = 1) {
  const resolved = resolveAccountKey(accountKey);
  const increment = Math.max(1, Number(count) || 1);
  const today = todayKey();
  const profile = await getUserProfile(resolved);
  const localStore = readLocalProgressStore();
  const local = localStore[resolved] || {};

  const previousDate = profile.lastClearDate || local.lastClearDate || null;
  const previousClears =
    previousDate === today
      ? Number(profile.clearsToday ?? local.clearsToday ?? 0)
      : 0;
  const previousStreak = Number(profile.streakDays ?? local.streakDays ?? 0);

  let streakDays = previousStreak;
  if (previousDate === today) {
    streakDays = previousStreak;
  } else if (previousDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    streakDays = previousDate === yesterdayKey ? previousStreak + 1 : 1;
  } else {
    streakDays = 1;
  }

  const clearsToday = previousClears + increment;
  const dailyGoal = Number(profile.dailyGoal ?? local.dailyGoal ?? DEFAULT_DAILY_GOAL);

  const engagement = {
    dailyGoal,
    clearsToday,
    streakDays,
    lastClearDate: today,
    goalMet: clearsToday >= dailyGoal,
    progress: dailyGoal > 0 ? Math.min(1, clearsToday / dailyGoal) : 0,
  };

  const supabase = getSupabase();
  if (supabase) {
    await upsertUserProfile(resolved, {
      dailyGoal,
      clearsToday,
      streakDays,
      lastClearDate: today,
    });
  } else {
    localStore[resolved] = engagement;
    writeLocalProgressStore(localStore);
  }

  return engagement;
}

module.exports = {
  DEFAULT_DAILY_GOAL,
  getDailyEngagement,
  recordClearance,
};
