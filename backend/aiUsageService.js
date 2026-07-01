const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./supabaseClient');
const { resolveAccountKey } = require('./accounts');

const USAGE_PATH = path.join(__dirname, 'data', 'ai_daily_usage.json');

const LIMITS = {
  triage: Number(process.env.AI_DAILY_TRIAGE_LIMIT || process.env.TRIAGE_DAILY_LIMIT || 25),
  llm: Number(process.env.AI_DAILY_LLM_LIMIT || 10),
  embedding: Number(process.env.AI_DAILY_EMBEDDING_LIMIT || 15),
};

const GLOBAL_LIMITS = {
  triage: Number(process.env.AI_GLOBAL_DAILY_TRIAGE_LIMIT ?? 100),
  llm: Number(process.env.AI_GLOBAL_DAILY_LLM_LIMIT ?? 40),
  embedding: Number(process.env.AI_GLOBAL_DAILY_EMBEDDING_LIMIT ?? 60),
};

const COLUMN_BY_TYPE = {
  triage: 'triage_count',
  llm: 'llm_count',
  embedding: 'embedding_count',
};

const EXEMPT_ACCOUNT_KEYS = new Set(
  String(process.env.AI_LIMIT_EXEMPT_ACCOUNT_KEYS || 'personal')
    .split(',')
    .map((value) => resolveAccountKey(value.trim()))
    .filter(Boolean),
);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function emptyRow() {
  return {
    triage_count: 0,
    llm_count: 0,
    embedding_count: 0,
  };
}

function readLocalStore() {
  try {
    const raw = fs.readFileSync(USAGE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalStore(store) {
  fs.mkdirSync(path.dirname(USAGE_PATH), { recursive: true });
  fs.writeFileSync(USAGE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function isQuotaExempt(accountKey) {
  return EXEMPT_ACCOUNT_KEYS.has(resolveAccountKey(accountKey));
}

function buildBucket(used, limit) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  const safeUsed = Math.max(0, Number(used) || 0);
  return {
    used: safeUsed,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - safeUsed),
  };
}

class AiQuotaError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'AiQuotaError';
    this.code = 'AI_QUOTA_EXCEEDED';
    this.status = 429;
    this.meta = meta;
  }
}

async function getPublicPoolUsage(type) {
  const column = COLUMN_BY_TYPE[type];
  const usageDate = todayKey();
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('ai_daily_usage')
      .select(`account_key, ${column}`)
      .eq('usage_date', usageDate);

    if (error) {
      throw new Error(error.message);
    }

    return (data || [])
      .filter((row) => !isQuotaExempt(row.account_key))
      .reduce((sum, row) => sum + Number(row[column] ?? 0), 0);
  }

  const store = readLocalStore();
  let total = 0;

  for (const [key, row] of Object.entries(store)) {
    if (!key.endsWith(`:${usageDate}`)) continue;
    const accountKey = key.slice(0, -(usageDate.length + 1));
    if (isQuotaExempt(accountKey)) continue;
    total += Number(row[column] ?? 0);
  }

  return total;
}

async function assertGlobalQuota(type, increment) {
  const limit = GLOBAL_LIMITS[type];
  if (!limit || limit <= 0) return;

  const poolUsed = await getPublicPoolUsage(type);
  if (poolUsed + increment > limit) {
    throw new AiQuotaError(
      `Daily ${type} AI pool limit reached. AI is temporarily unavailable — try again tomorrow.`,
      {
        type,
        scope: 'global',
        ...buildBucket(poolUsed, limit),
      },
    );
  }
}

async function readUsageRow(accountKey) {
  const resolved = resolveAccountKey(accountKey);
  const usageDate = todayKey();
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('ai_daily_usage')
      .select('triage_count, llm_count, embedding_count')
      .eq('account_key', resolved)
      .eq('usage_date', usageDate)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return {
      triage_count: Number(data?.triage_count ?? 0),
      llm_count: Number(data?.llm_count ?? 0),
      embedding_count: Number(data?.embedding_count ?? 0),
    };
  }

  const store = readLocalStore();
  const local = store[`${resolved}:${usageDate}`] || emptyRow();
  return {
    triage_count: Number(local.triage_count ?? 0),
    llm_count: Number(local.llm_count ?? 0),
    embedding_count: Number(local.embedding_count ?? 0),
  };
}

async function writeUsageRow(accountKey, row) {
  const resolved = resolveAccountKey(accountKey);
  const usageDate = todayKey();
  const supabase = getSupabase();

  const payload = {
    account_key: resolved,
    usage_date: usageDate,
    triage_count: Number(row.triage_count ?? 0),
    llm_count: Number(row.llm_count ?? 0),
    embedding_count: Number(row.embedding_count ?? 0),
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    const { error } = await supabase.from('ai_daily_usage').upsert(payload, {
      onConflict: 'account_key,usage_date',
    });

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const store = readLocalStore();
  store[`${resolved}:${usageDate}`] = payload;
  writeLocalStore(store);
}

async function getUsageSummary(accountKey) {
  const resolved = resolveAccountKey(accountKey);
  const row = await readUsageRow(resolved);
  const exempt = isQuotaExempt(resolved);

  return {
    accountKey: resolved,
    exempt,
    date: todayKey(),
    triage: buildBucket(row.triage_count, LIMITS.triage),
    llm: buildBucket(row.llm_count, LIMITS.llm),
    embedding: buildBucket(row.embedding_count, LIMITS.embedding),
  };
}

async function consumeAiQuota(accountKey, type, count = 1) {
  const resolved = resolveAccountKey(accountKey);
  const column = COLUMN_BY_TYPE[type];
  const limit = LIMITS[type];

  if (!column || !Number.isFinite(limit)) {
    throw new Error(`Unknown AI quota type: ${type}`);
  }

  const increment = Math.max(0, Number(count) || 0);
  if (increment === 0) {
    return getUsageSummary(resolved);
  }

  if (isQuotaExempt(resolved)) {
    return getUsageSummary(resolved);
  }

  await assertGlobalQuota(type, increment);

  const row = await readUsageRow(resolved);
  const used = Number(row[column] ?? 0);
  const remaining = Math.max(0, limit - used);

  if (remaining <= 0) {
    throw new AiQuotaError(`Daily ${type} AI limit reached (${limit}/day). Try again tomorrow.`, {
      type,
      ...buildBucket(used, limit),
      summary: await getUsageSummary(resolved),
    });
  }

  if (increment > remaining) {
    throw new AiQuotaError(
      `Daily ${type} AI limit would be exceeded (${used}/${limit} used, requested ${increment}).`,
      {
        type,
        requested: increment,
        ...buildBucket(used, limit),
        summary: await getUsageSummary(resolved),
      },
    );
  }

  row[column] = used + increment;
  await writeUsageRow(resolved, row);
  return getUsageSummary(resolved);
}

async function reserveTriageQuota(accountKey, requestedCount) {
  const resolved = resolveAccountKey(accountKey);
  const count = Math.max(0, Number(requestedCount) || 0);

  if (count === 0) {
    const summary = await getUsageSummary(resolved);
    return {
      allowed: 0,
      used: summary.triage.used,
      limit: summary.triage.limit,
      remaining: summary.triage.remaining,
      exempt: summary.exempt,
    };
  }

  if (isQuotaExempt(resolved)) {
    return {
      allowed: count,
      used: 0,
      limit: LIMITS.triage,
      remaining: LIMITS.triage,
      exempt: true,
    };
  }

  await assertGlobalQuota('triage', count);

  const row = await readUsageRow(resolved);
  const used = Number(row.triage_count ?? 0);
  const remaining = Math.max(0, LIMITS.triage - used);

  if (remaining <= 0) {
    throw new AiQuotaError(
      `Daily triage limit reached (${LIMITS.triage}/day). Try again tomorrow.`,
      {
        type: 'triage',
        ...buildBucket(used, LIMITS.triage),
        summary: await getUsageSummary(resolved),
      },
    );
  }

  const allowed = Math.min(count, remaining);
  row.triage_count = used + allowed;
  await writeUsageRow(resolved, row);

  const nextUsed = Number(row.triage_count ?? 0);
  return {
    allowed,
    used: nextUsed,
    limit: LIMITS.triage,
    remaining: Math.max(0, LIMITS.triage - nextUsed),
    exempt: false,
  };
}

async function getDailyTriageUsage(accountKey) {
  const summary = await getUsageSummary(accountKey);
  return summary.triage.used;
}

async function tryConsumeAiQuota(accountKey, type, count = 1) {
  try {
    await consumeAiQuota(accountKey, type, count);
    return true;
  } catch (error) {
    if (error?.code === 'AI_QUOTA_EXCEEDED') {
      return false;
    }
    throw error;
  }
}

function handleQuotaHttpError(res, error) {
  if (error?.code === 'AI_QUOTA_EXCEEDED' || error?.code === 'TRIAGE_LIMIT_EXCEEDED') {
    res.status(429).json({
      error: error.message,
      usage: error.meta?.summary ?? error.meta ?? null,
    });
    return true;
  }

  return false;
}

module.exports = {
  LIMITS,
  GLOBAL_LIMITS,
  DAILY_LIMIT: LIMITS.triage,
  AiQuotaError,
  isQuotaExempt,
  getUsageSummary,
  consumeAiQuota,
  tryConsumeAiQuota,
  reserveTriageQuota,
  getDailyTriageUsage,
  getDailyUsage: getDailyTriageUsage,
  handleQuotaHttpError,
};
