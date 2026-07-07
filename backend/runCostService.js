const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./supabaseClient');
const { resolveAccountKey, resolveFinanceAccountKeys } = require('./accounts');
const { getMonthKey, buildFinanceSummary } = require('./financeLedger');
const { getUsageSummary } = require('./aiUsageService');
const { getMonthlyAiCostSummary } = require('./aiCostTracker');

const USAGE_PATH = path.join(__dirname, 'data', 'ai_daily_usage.json');

function readLocalUsageStore() {
  try {
    const raw = fs.readFileSync(USAGE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function getProviderEstimateConfig() {
  return {
    railwayMonthlyUsd: readNumberEnv('RUN_COST_RAILWAY_MONTHLY_USD', 5),
    supabaseMonthlyUsd: readNumberEnv('RUN_COST_SUPABASE_MONTHLY_USD', 0),
    expoMonthlyUsd: readNumberEnv('RUN_COST_EXPO_MONTHLY_USD', 0),
    googleMonthlyUsd: readNumberEnv('RUN_COST_GOOGLE_MONTHLY_USD', 0),
    aiTriageUnitUsd: readNumberEnv('RUN_COST_AI_TRIAGE_UNIT_USD', 0.002),
    aiLlmUnitUsd: readNumberEnv('RUN_COST_AI_LLM_UNIT_USD', 0.02),
    aiEmbeddingUnitUsd: readNumberEnv('RUN_COST_AI_EMBEDDING_UNIT_USD', 0.0004),
  };
}

async function getMonthUsageTotals(accountKey, monthKey) {
  const resolved = resolveAccountKey(accountKey);
  const accountKeys = new Set(resolveFinanceAccountKeys(resolved));
  const supabase = getSupabase();

  const empty = { triage: 0, llm: 0, embedding: 0 };

  if (supabase) {
    const { data, error } = await supabase
      .from('ai_daily_usage')
      .select('account_key, usage_date, triage_count, llm_count, embedding_count')
      .gte('usage_date', `${monthKey}-01`)
      .lt('usage_date', `${nextMonthKey(monthKey)}-01`);

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).reduce((totals, row) => {
      if (!accountKeys.has(row.account_key)) {
        return totals;
      }
      totals.triage += Number(row.triage_count ?? 0);
      totals.llm += Number(row.llm_count ?? 0);
      totals.embedding += Number(row.embedding_count ?? 0);
      return totals;
    }, empty);
  }

  const store = readLocalUsageStore();
  return Object.entries(store).reduce((totals, [key, row]) => {
    const [rowAccountKey, usageDate] = key.split(':');
    if (!accountKeys.has(rowAccountKey) || !String(usageDate || '').startsWith(monthKey)) {
      return totals;
    }
    totals.triage += Number(row.triage_count ?? 0);
    totals.llm += Number(row.llm_count ?? 0);
    totals.embedding += Number(row.embedding_count ?? 0);
    return totals;
  }, empty);
}

function nextMonthKey(monthKey) {
  const [yearString, monthString] = String(monthKey).split('-');
  const year = Number(yearString);
  const month = Number(monthString);
  const date = new Date(Date.UTC(year, month, 1));
  return getMonthKey(date);
}

async function buildRunCostSummary(accountKey, options = {}) {
  const resolved = resolveAccountKey(accountKey);
  const monthKey = options.monthKey || getMonthKey();
  const [financeSummary, aiToday, aiMonthUsage] = await Promise.all([
    buildFinanceSummary({ accountKey: resolved, monthKey, limit: 25 }),
    getUsageSummary(resolved),
    getMonthUsageTotals(resolved, monthKey),
  ]);
  const aiCostSummary = await getMonthlyAiCostSummary(resolved, monthKey);

  const providerConfig = getProviderEstimateConfig();
  const estimatedAiMonthToDate =
    aiCostSummary.estimatedCostUsd > 0
      ? aiCostSummary.estimatedCostUsd
      : aiMonthUsage.triage * providerConfig.aiTriageUnitUsd +
        aiMonthUsage.llm * providerConfig.aiLlmUnitUsd +
        aiMonthUsage.embedding * providerConfig.aiEmbeddingUnitUsd;

  const providerEstimates = [
    {
      key: 'railway',
      label: 'Railway',
      amount: providerConfig.railwayMonthlyUsd,
      source: 'manual_estimate',
    },
    {
      key: 'supabase',
      label: 'Supabase',
      amount: providerConfig.supabaseMonthlyUsd,
      source: 'manual_estimate',
    },
    {
      key: 'expo',
      label: 'Expo / EAS',
      amount: providerConfig.expoMonthlyUsd,
      source: 'manual_estimate',
    },
    {
      key: 'google',
      label: 'Google / Firebase',
      amount: providerConfig.googleMonthlyUsd,
      source: 'manual_estimate',
    },
    {
      key: 'ai',
      label: 'AI usage',
      amount: Math.round(estimatedAiMonthToDate * 100) / 100,
      source: 'estimated_from_usage',
    },
  ];

  const providerEstimateTotal = providerEstimates.reduce((sum, item) => sum + item.amount, 0);

  return {
    accountKey: resolved,
    monthKey,
    finance: financeSummary,
    aiToday,
    aiMonthUsage,
    aiCostSummary,
    providerEstimates,
    visibility: {
      liveProviderBillingConnected: false,
      canSeeBillingEmails: true,
      canEstimateAiFromUsage: true,
      hasTokenBasedAiCosting: aiCostSummary.totalTokens > 0,
    },
    totals: {
      trackedLedgerMonthToDate: financeSummary.totalMonthToDate,
      providerEstimateMonthToDate: Math.round(providerEstimateTotal * 100) / 100,
      combinedViewMonthToDate:
        Math.round((financeSummary.totalMonthToDate + providerEstimateTotal) * 100) / 100,
    },
  };
}

module.exports = {
  buildRunCostSummary,
};
