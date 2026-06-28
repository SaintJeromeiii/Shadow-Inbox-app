const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSupabase } = require('./supabaseClient');

const BRIEFS_PATH = path.join(__dirname, 'data', 'executive_briefs.json');

function readBriefsFromFile() {
  try {
    const raw = fs.readFileSync(BRIEFS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: parsed?.version || 1,
      briefs: Array.isArray(parsed?.briefs) ? parsed.briefs : [],
    };
  } catch {
    return { version: 1, briefs: [] };
  }
}

function writeBriefsToFile(store) {
  fs.mkdirSync(path.dirname(BRIEFS_PATH), { recursive: true });
  fs.writeFileSync(BRIEFS_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function buildBriefId() {
  return `brief_${crypto.randomBytes(4).toString('hex')}`;
}

function rowToBrief(row) {
  return {
    id: row.id,
    accountKey: row.account_key,
    summaryText: row.summary_text,
    urgencyLevel: row.urgency_level,
    signalCount: row.signal_count,
    mode: row.mode,
    createdAt: row.created_at,
  };
}

function briefToRow(brief) {
  return {
    id: brief.id,
    account_key: brief.accountKey,
    summary_text: brief.summaryText,
    urgency_level: brief.urgencyLevel,
    signal_count: brief.signalCount,
    mode: brief.mode,
    created_at: brief.createdAt,
  };
}

async function appendExecutiveBrief(input) {
  const now = new Date().toISOString();
  const brief = {
    id: input.id || buildBriefId(),
    accountKey: input.accountKey || 'all',
    summaryText: String(input.summaryText || '').trim(),
    urgencyLevel: String(input.urgencyLevel || 'routine').trim(),
    signalCount: Number(input.signalCount) || 0,
    mode: input.mode || 'live',
    createdAt: now,
  };

  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase.from('executive_briefs').insert(briefToRow(brief));

    if (error) {
      throw new Error(`Failed to append executive brief: ${error.message}`);
    }

    return brief;
  }

  const store = readBriefsFromFile();
  store.briefs = [brief, ...store.briefs];
  writeBriefsToFile(store);
  return brief;
}

async function getLatestExecutiveBrief(accountKey = null) {
  const supabase = getSupabase();
  const scopeKeys = accountKey ? [accountKey, 'all'] : ['all'];

  if (supabase) {
    const { data, error } = await supabase
      .from('executive_briefs')
      .select('*')
      .in('account_key', scopeKeys)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to read executive brief: ${error.message}`);
    }

    return data?.[0] ? rowToBrief(data[0]) : null;
  }

  const store = readBriefsFromFile();
  const matches = store.briefs.filter((brief) => scopeKeys.includes(brief.accountKey));
  matches.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return matches[0] || null;
}

module.exports = {
  BRIEFS_PATH,
  buildBriefId,
  appendExecutiveBrief,
  getLatestExecutiveBrief,
};
