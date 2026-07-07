const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./supabaseClient');
const { resolveAccountKey, resolveFinanceAccountKeys } = require('./accounts');
const { getMonthKey } = require('./financeLedger');

const AI_COST_PATH = path.join(__dirname, 'data', 'ai_cost_daily_usage.json');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100000) / 100000;
}

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function getModelPricing(model, type) {
  const normalized = String(model || '').toLowerCase();

  if (type === 'embedding') {
    return {
      inputPer1k: readNumberEnv('AI_COST_EMBEDDING_INPUT_PER_1K_USD', 0.00002),
      outputPer1k: 0,
    };
  }

  if (normalized.includes('gpt-4o-mini')) {
    return {
      inputPer1k: readNumberEnv('AI_COST_GPT_4O_MINI_INPUT_PER_1K_USD', 0.00015),
      outputPer1k: readNumberEnv('AI_COST_GPT_4O_MINI_OUTPUT_PER_1K_USD', 0.0006),
    };
  }

  if (normalized.includes('gpt-4o')) {
    return {
      inputPer1k: readNumberEnv('AI_COST_GPT_4O_INPUT_PER_1K_USD', 0.005),
      outputPer1k: readNumberEnv('AI_COST_GPT_4O_OUTPUT_PER_1K_USD', 0.015),
    };
  }

  return {
    inputPer1k: readNumberEnv('AI_COST_DEFAULT_INPUT_PER_1K_USD', 0.00015),
    outputPer1k: readNumberEnv('AI_COST_DEFAULT_OUTPUT_PER_1K_USD', 0.0006),
  };
}

function readLocalStore() {
  try {
    const raw = fs.readFileSync(AI_COST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalStore(store) {
  fs.mkdirSync(path.dirname(AI_COST_PATH), { recursive: true });
  fs.writeFileSync(AI_COST_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

async function recordAiUsageCost({
  accountKey,
  provider = 'openai',
  model = 'unknown',
  type = 'llm',
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
}) {
  const resolved = resolveAccountKey(accountKey);
  if (!resolved) return null;

  const prompt = Math.max(0, Number(promptTokens) || 0);
  const completion = Math.max(0, Number(completionTokens) || 0);
  const total = Math.max(totalTokens || prompt + completion, prompt + completion);
  const pricing = getModelPricing(model, type);
  const estimatedCostUsd = roundCurrency(
    (prompt / 1000) * pricing.inputPer1k + (completion / 1000) * pricing.outputPer1k,
  );

  const payload = {
    account_key: resolved,
    usage_date: todayKey(),
    provider: String(provider || 'openai'),
    model: String(model || 'unknown'),
    usage_type: String(type || 'llm'),
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    estimated_cost_usd: estimatedCostUsd,
    updated_at: new Date().toISOString(),
  };

  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data: existing, error: readError } = await supabase
        .from('ai_cost_daily_usage')
        .select('prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd')
        .eq('account_key', payload.account_key)
        .eq('usage_date', payload.usage_date)
        .eq('provider', payload.provider)
        .eq('model', payload.model)
        .eq('usage_type', payload.usage_type)
        .maybeSingle();

      if (readError) {
        throw new Error(readError.message);
      }

      const merged = {
        ...payload,
        prompt_tokens: Number(existing?.prompt_tokens ?? 0) + prompt,
        completion_tokens: Number(existing?.completion_tokens ?? 0) + completion,
        total_tokens: Number(existing?.total_tokens ?? 0) + total,
        estimated_cost_usd: roundCurrency(
          Number(existing?.estimated_cost_usd ?? 0) + estimatedCostUsd,
        ),
      };

      const { error } = await supabase.from('ai_cost_daily_usage').upsert(merged, {
        onConflict: 'account_key,usage_date,provider,model,usage_type',
        ignoreDuplicates: false,
      });

      if (!error) {
        return merged;
      }
    }
  } catch (error) {
    console.warn('[AI Cost] Supabase write failed, falling back to local store:', error);
  }

  const store = readLocalStore();
  const key = [
    payload.account_key,
    payload.usage_date,
    payload.provider,
    payload.model,
    payload.usage_type,
  ].join(':');
  const existing = store[key] || {
    ...payload,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
  };
  store[key] = {
    ...existing,
    prompt_tokens: Number(existing.prompt_tokens || 0) + prompt,
    completion_tokens: Number(existing.completion_tokens || 0) + completion,
    total_tokens: Number(existing.total_tokens || 0) + total,
    estimated_cost_usd: roundCurrency(Number(existing.estimated_cost_usd || 0) + estimatedCostUsd),
    updated_at: payload.updated_at,
  };
  writeLocalStore(store);
  return store[key];
}

async function getMonthlyAiCostSummary(accountKey, monthKey = getMonthKey()) {
  const resolved = resolveAccountKey(accountKey);
  const accountKeys = new Set(resolveFinanceAccountKeys(resolved));
  const empty = {
    monthKey,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    byType: {
      triage: { totalTokens: 0, estimatedCostUsd: 0 },
      llm: { totalTokens: 0, estimatedCostUsd: 0 },
      embedding: { totalTokens: 0, estimatedCostUsd: 0 },
    },
  };

  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('ai_cost_daily_usage')
        .select('*')
        .gte('usage_date', `${monthKey}-01`)
        .lt('usage_date', `${nextMonthKey(monthKey)}-01`);

      if (!error && Array.isArray(data)) {
        return accumulateSummary(data, accountKeys, empty);
      }
    }
  } catch (error) {
    console.warn('[AI Cost] Supabase monthly read failed, using local store:', error);
  }

  const localRows = Object.values(readLocalStore());
  return accumulateSummary(localRows, accountKeys, empty);
}

function nextMonthKey(monthKey) {
  const [yearString, monthString] = String(monthKey).split('-');
  const date = new Date(Date.UTC(Number(yearString), Number(monthString), 1));
  return getMonthKey(date);
}

function accumulateSummary(rows, accountKeys, base) {
  for (const row of rows || []) {
    if (!accountKeys.has(row.account_key)) continue;
    if (!String(row.usage_date || '').startsWith(base.monthKey)) continue;
    base.promptTokens += Number(row.prompt_tokens || 0);
    base.completionTokens += Number(row.completion_tokens || 0);
    base.totalTokens += Number(row.total_tokens || 0);
    base.estimatedCostUsd = roundCurrency(
      base.estimatedCostUsd + Number(row.estimated_cost_usd || 0),
    );
    const usageType =
      row.usage_type === 'triage' || row.usage_type === 'embedding' ? row.usage_type : 'llm';
    base.byType[usageType].totalTokens += Number(row.total_tokens || 0);
    base.byType[usageType].estimatedCostUsd = roundCurrency(
      base.byType[usageType].estimatedCostUsd + Number(row.estimated_cost_usd || 0),
    );
  }
  return base;
}

module.exports = {
  recordAiUsageCost,
  getMonthlyAiCostSummary,
};
