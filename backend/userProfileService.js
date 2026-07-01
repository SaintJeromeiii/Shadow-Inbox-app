const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSupabase } = require('./supabaseClient');
const { resolveAccountKey } = require('./accounts');
const { loadKnowledgeBase } = require('./knowledgeBase');

const PROFILE_STORE_PATH = path.join(__dirname, 'data', 'user_profiles.json');
const LIVE_UPDATE_MARKER = '=== LIVE UPDATE [';

const DEFAULT_PROFILE = {
  displayName: 'Operator',
  email: '',
  roleTitle: 'Professional',
  toneNotes:
    'Sharp, efficient, concise, and professional. No filler, warmth-padding, or corporate fluff.',
  signOff: '',
  knowledgeText: '',
  onboardingCompleted: false,
  dailyGoal: 10,
  clearsToday: 0,
  streakDays: 0,
  lastClearDate: null,
};

function readLocalStore() {
  try {
    const raw = fs.readFileSync(PROFILE_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalStore(store) {
  fs.mkdirSync(path.dirname(PROFILE_STORE_PATH), { recursive: true });
  fs.writeFileSync(PROFILE_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function normalizeProfile(input = {}) {
  return {
    displayName: String(input.displayName || input.display_name || DEFAULT_PROFILE.displayName).trim(),
    email: String(input.email || '').trim().toLowerCase(),
    roleTitle: String(input.roleTitle || input.role_title || DEFAULT_PROFILE.roleTitle).trim(),
    toneNotes: String(input.toneNotes || input.tone_notes || DEFAULT_PROFILE.toneNotes).trim(),
    signOff: String(input.signOff || input.sign_off || '').trim(),
    knowledgeText: String(input.knowledgeText || input.knowledge_text || '').trim(),
    onboardingCompleted: Boolean(
      input.onboardingCompleted ?? input.onboarding_completed ?? false,
    ),
    dailyGoal: Number(input.dailyGoal ?? input.daily_goal ?? DEFAULT_PROFILE.dailyGoal),
    clearsToday: Number(input.clearsToday ?? input.clears_today ?? DEFAULT_PROFILE.clearsToday),
    streakDays: Number(input.streakDays ?? input.streak_days ?? DEFAULT_PROFILE.streakDays),
    lastClearDate: input.lastClearDate ?? input.last_clear_date ?? null,
  };
}

function rowToProfile(row) {
  if (!row) {
    return { ...DEFAULT_PROFILE };
  }

  return normalizeProfile({
    displayName: row.display_name,
    email: row.email,
    roleTitle: row.role_title,
    toneNotes: row.tone_notes,
    signOff: row.sign_off,
    knowledgeText: row.knowledge_text,
    onboardingCompleted: row.onboarding_completed,
    dailyGoal: row.daily_goal,
    clearsToday: row.clears_today,
    streakDays: row.streak_days,
    lastClearDate: row.last_clear_date,
  });
}

function profileToRow(accountKey, profile) {
  const normalized = normalizeProfile(profile);
  return {
    account_key: resolveAccountKey(accountKey),
    display_name: normalized.displayName,
    email: normalized.email,
    role_title: normalized.roleTitle,
    tone_notes: normalized.toneNotes,
    sign_off: normalized.signOff,
    knowledge_text: normalized.knowledgeText,
    onboarding_completed: normalized.onboardingCompleted,
    daily_goal: normalized.dailyGoal,
    clears_today: normalized.clearsToday,
    streak_days: normalized.streakDays,
    last_clear_date: normalized.lastClearDate,
    updated_at: new Date().toISOString(),
  };
}

function buildKnowledgeText(profile) {
  const normalized = normalizeProfile(profile);
  const sections = [
    `Name: ${normalized.displayName}`,
    normalized.email ? `Primary email: ${normalized.email}` : null,
    normalized.roleTitle ? `Role: ${normalized.roleTitle}` : null,
    normalized.toneNotes ? `Communication tone:\n${normalized.toneNotes}` : null,
    normalized.signOff ? `Preferred sign-off: ${normalized.signOff}` : null,
  ].filter(Boolean);

  if (normalized.knowledgeText) {
    sections.push('', normalized.knowledgeText);
  }

  return sections.join('\n').trim();
}

function parseLiveUpdates(content) {
  const updates = [];
  const pattern =
    /=== LIVE UPDATE \[([^\]]+)\] ===\n([\s\S]*?)(?=\n\n=== LIVE UPDATE \[|$)/g;

  let match = pattern.exec(content);
  while (match) {
    const timestamp = match[1].trim();
    const text = match[2].trim();
    if (text) {
      updates.push({
        id: crypto
          .createHash('sha1')
          .update(`${timestamp}:${text}`)
          .digest('hex')
          .slice(0, 12),
        timestamp,
        text,
      });
    }
    match = pattern.exec(content);
  }

  return updates.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

async function getUserProfile(accountKey) {
  const resolved = resolveAccountKey(accountKey);
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('account_key', resolved)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return rowToProfile(data);
    }
  } else {
    const store = readLocalStore();
    if (store[resolved]) {
      return normalizeProfile(store[resolved]);
    }
  }

  if (resolved === 'personal') {
    const legacyKnowledge = loadKnowledgeBase();
    if (legacyKnowledge) {
      return normalizeProfile({
        ...DEFAULT_PROFILE,
        displayName: 'Jerome',
        email: 'jleonandersonjr@gmail.com',
        roleTitle: 'Program analyst and resource manager',
        knowledgeText: legacyKnowledge,
        onboardingCompleted: true,
      });
    }
  }

  return { ...DEFAULT_PROFILE };
}

async function upsertUserProfile(accountKey, updates) {
  const resolved = resolveAccountKey(accountKey);
  const current = await getUserProfile(resolved);
  const merged = normalizeProfile({ ...current, ...updates });
  const row = profileToRow(resolved, merged);
  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase.from('user_profiles').upsert(row, {
      onConflict: 'account_key',
    });

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const store = readLocalStore();
    store[resolved] = merged;
    writeLocalStore(store);
  }

  return merged;
}

async function appendProfileKnowledgeSnippet(accountKey, snippet) {
  const text = String(snippet || '').trim();
  if (!text) {
    throw new Error('Knowledge snippet is required.');
  }

  if (text.length > 4000) {
    throw new Error('Knowledge snippet is too long (max 4000 characters).');
  }

  const resolved = resolveAccountKey(accountKey);
  const current = await getUserProfile(resolved);
  const timestamp = new Date().toISOString();
  const block = `\n\n${LIVE_UPDATE_MARKER}${timestamp}] ===\n${text}\n`;
  const knowledgeText = `${current.knowledgeText || buildKnowledgeText(current)}${block}`.trim();

  return upsertUserProfile(resolved, { knowledgeText });
}

async function getKnowledgeForTriage(accountKey) {
  const profile = await getUserProfile(accountKey);
  const built = buildKnowledgeText(profile);
  return {
    profile,
    knowledgeText: built,
    userEmail: profile.email,
    displayName: profile.displayName,
  };
}

async function getStructuredProfileKnowledge(accountKey) {
  const profile = await getUserProfile(accountKey);
  const fullText = buildKnowledgeText(profile);
  const recentMemories = parseLiveUpdates(profile.knowledgeText || fullText);
  const paragraphs = fullText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    profile,
    fullText,
    paragraphs,
    recentMemories,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  DEFAULT_PROFILE,
  buildKnowledgeText,
  getUserProfile,
  upsertUserProfile,
  appendProfileKnowledgeSnippet,
  getKnowledgeForTriage,
  getStructuredProfileKnowledge,
  parseLiveUpdates,
};
