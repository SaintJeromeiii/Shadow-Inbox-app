const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSupabase } = require('./supabaseClient');

const RULES_PATH = path.join(__dirname, 'data', 'auto_rules.json');

const PLATFORM_TO_SOURCE = {
  email: 'Email',
  slack: 'Slack',
  discord: 'Discord',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

function readRulesStoreFromFile() {
  try {
    const raw = fs.readFileSync(RULES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: parsed?.version || 1,
      rules: Array.isArray(parsed?.rules) ? parsed.rules : [],
    };
  } catch {
    return { version: 1, rules: [] };
  }
}

function writeRulesStoreToFile(store) {
  fs.mkdirSync(path.dirname(RULES_PATH), { recursive: true });
  fs.writeFileSync(RULES_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function rowToRule(row) {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    condition: row.condition,
    action: row.action,
    replyText: row.reply_text,
    autoCloseTask: row.auto_close_task,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ruleToRow(rule) {
  return {
    id: String(rule.id),
    name: rule.name,
    platform: rule.platform,
    condition: rule.condition,
    action: rule.action,
    reply_text: rule.replyText,
    auto_close_task: rule.autoCloseTask,
    enabled: rule.enabled,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
  };
}

async function readRulesStore() {
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('auto_pilot_rules')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      throw new Error(`Failed to read auto-pilot rules: ${error.message}`);
    }

    return {
      version: 1,
      rules: (data || []).map(rowToRule),
    };
  }

  return readRulesStoreFromFile();
}

async function writeRulesStore(store) {
  const supabase = getSupabase();

  if (supabase) {
    const rows = store.rules.map(ruleToRow);
    const { error: deleteError } = await supabase.from('auto_pilot_rules').delete().neq('id', '');

    if (deleteError) {
      throw new Error(`Failed to clear auto-pilot rules: ${deleteError.message}`);
    }

    if (rows.length === 0) {
      return;
    }

    const { error: insertError } = await supabase.from('auto_pilot_rules').insert(rows);

    if (insertError) {
      throw new Error(`Failed to write auto-pilot rules: ${insertError.message}`);
    }

    return;
  }

  writeRulesStoreToFile(store);
}

async function listRules({ includeDisabled = true } = {}) {
  const store = await readRulesStore();
  const rules = includeDisabled
    ? store.rules
    : store.rules.filter((rule) => rule.enabled !== false);
  return rules.sort((a, b) => Number(a.id) - Number(b.id));
}

async function getActiveRules() {
  return listRules({ includeDisabled: false });
}

async function getRuleById(ruleId) {
  const store = await readRulesStore();
  return store.rules.find((rule) => rule.id === String(ruleId)) || null;
}

async function setRuleEnabled(ruleId, enabled) {
  const store = await readRulesStore();
  const rule = store.rules.find((item) => item.id === String(ruleId));
  if (!rule) {
    throw new Error(`Auto-pilot rule not found: ${ruleId}`);
  }

  rule.enabled = Boolean(enabled);
  rule.updatedAt = new Date().toISOString();

  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase
      .from('auto_pilot_rules')
      .update({
        enabled: rule.enabled,
        updated_at: rule.updatedAt,
      })
      .eq('id', rule.id);

    if (error) {
      throw new Error(`Failed to update auto-pilot rule: ${error.message}`);
    }

    return rule;
  }

  writeRulesStoreToFile(store);
  return rule;
}

function normalizePlatform(platform) {
  return String(platform || 'any').trim().toLowerCase();
}

function platformMatches(notification, platform) {
  const normalized = normalizePlatform(platform);
  if (!normalized || normalized === 'any' || normalized === '*') {
    return true;
  }

  const expected = PLATFORM_TO_SOURCE[normalized] || platform;
  return notification.sourceApp === expected;
}

function matchesCondition(notification, condition) {
  const rawCondition = String(condition || '').trim();
  if (!rawCondition) return false;

  const haystack = [
    notification.rawText,
    notification.sender,
    notification.channelName,
    notification.triage?.cleanSummary,
    notification.triage?.category,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const quotedMatch = rawCondition.match(
    /contains\s+(?:word\s+)?['"]([^'"]+)['"]/i,
  );
  if (quotedMatch) {
    return haystack.includes(quotedMatch[1].toLowerCase());
  }

  if (/^category:/i.test(rawCondition)) {
    const category = rawCondition.replace(/^category:/i, '').trim().toLowerCase();
    return String(notification.triage?.category || '').toLowerCase() === category;
  }

  if (/^sender:/i.test(rawCondition)) {
    const senderNeedle = rawCondition.replace(/^sender:/i, '').trim().toLowerCase();
    return notification.sender.toLowerCase().includes(senderNeedle);
  }

  return haystack.includes(rawCondition.toLowerCase());
}

async function findMatchingRule(notification, rules = null) {
  const activeRules = rules || (await getActiveRules());

  for (const rule of activeRules) {
    if (rule.enabled === false) continue;
    if (!platformMatches(notification, rule.platform)) continue;
    if (!matchesCondition(notification, rule.condition)) continue;
    return rule;
  }
  return null;
}

async function createRule(input = {}) {
  const store = await readRulesStore();
  const id = input.id || crypto.randomBytes(4).toString('hex');
  const now = new Date().toISOString();

  const rule = {
    id: String(id),
    name: String(input.name || `Rule ${id}`).slice(0, 120),
    platform: normalizePlatform(input.platform || 'any'),
    condition: String(input.condition || '').slice(0, 240),
    action: input.action === 'archive' ? 'archive' : 'reply',
    replyText: input.replyText ? String(input.replyText).slice(0, 1000) : null,
    autoCloseTask: input.autoCloseTask !== false,
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };

  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase.from('auto_pilot_rules').insert(ruleToRow(rule));

    if (error) {
      throw new Error(`Failed to create auto-pilot rule: ${error.message}`);
    }

    return rule;
  }

  store.rules.push(rule);
  writeRulesStoreToFile(store);
  return rule;
}

module.exports = {
  RULES_PATH,
  listRules,
  getActiveRules,
  getRuleById,
  setRuleEnabled,
  findMatchingRule,
  matchesCondition,
  platformMatches,
  createRule,
};
