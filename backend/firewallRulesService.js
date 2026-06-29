const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSupabase } = require('./supabaseClient');
const { resolveFinanceAccountKeys } = require('./accounts');

const RULES_PATH = path.join(__dirname, 'data', 'firewall_rules.json');

const VALID_RULE_TYPES = new Set(['sender', 'subject_keyword', 'app_source']);
const VALID_ACTION_EFFECTS = new Set([
  'MUTED_ARCHIVE',
  'HIGH_PRIORITY_PUSH',
  'BLOCK_DROP',
]);

const ACTION_PRIORITY = {
  BLOCK_DROP: 3,
  HIGH_PRIORITY_PUSH: 2,
  MUTED_ARCHIVE: 1,
};

function readRulesFromFile() {
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

function writeRulesToFile(store) {
  fs.mkdirSync(path.dirname(RULES_PATH), { recursive: true });
  fs.writeFileSync(RULES_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function buildRuleId() {
  return `fw_${crypto.randomBytes(4).toString('hex')}`;
}

function rowToRule(row) {
  return {
    id: row.id,
    userId: row.user_id,
    ruleType: row.rule_type,
    matchValue: row.match_value,
    actionEffect: row.action_effect,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function ruleToRow(rule) {
  return {
    id: rule.id,
    user_id: rule.userId,
    rule_type: rule.ruleType,
    match_value: rule.matchValue,
    action_effect: rule.actionEffect,
    is_active: rule.isActive,
    created_at: rule.createdAt,
  };
}

function normalizeRuleType(value) {
  const ruleType = String(value || '').trim().toLowerCase();
  return VALID_RULE_TYPES.has(ruleType) ? ruleType : null;
}

function normalizeActionEffect(value) {
  const actionEffect = String(value || '').trim().toUpperCase();
  return VALID_ACTION_EFFECTS.has(actionEffect) ? actionEffect : null;
}

async function resolveFirewallUserIds(accountKey) {
  if (!accountKey || accountKey === 'all') {
    return ['personal'];
  }
  return resolveFinanceAccountKeys(accountKey);
}

async function listFirewallRules(accountKey, { activeOnly = false } = {}) {
  const userIds = await resolveFirewallUserIds(accountKey);
  const supabase = getSupabase();

  if (supabase) {
    let query = supabase
      .from('firewall_rules')
      .select('*')
      .in('user_id', userIds)
      .order('created_at', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to read firewall rules: ${error.message}`);
    }

    return (data || []).map(rowToRule);
  }

  const store = readRulesFromFile();
  return store.rules
    .filter((rule) => userIds.includes(rule.userId))
    .filter((rule) => (activeOnly ? rule.isActive : true))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function createFirewallRule(accountKey, input) {
  const ruleType = normalizeRuleType(input.ruleType);
  const actionEffect = normalizeActionEffect(input.actionEffect);
  const matchValue = String(input.matchValue || '').trim();

  if (!ruleType) {
    throw new Error('Invalid rule_type. Use sender, subject_keyword, or app_source.');
  }

  if (!actionEffect) {
    throw new Error(
      'Invalid action_effect. Use MUTED_ARCHIVE, HIGH_PRIORITY_PUSH, or BLOCK_DROP.',
    );
  }

  if (!matchValue) {
    throw new Error('match_value is required.');
  }

  const now = new Date().toISOString();
  const rule = {
    id: buildRuleId(),
    userId: accountKey,
    ruleType,
    matchValue,
    actionEffect,
    isActive: input.isActive !== false,
    createdAt: now,
  };

  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase.from('firewall_rules').insert(ruleToRow(rule));

    if (error) {
      throw new Error(`Failed to create firewall rule: ${error.message}`);
    }

    return rule;
  }

  const store = readRulesFromFile();
  store.rules = [rule, ...store.rules];
  writeRulesToFile(store);
  return rule;
}

async function deleteFirewallRule(accountKey, ruleId) {
  const userIds = await resolveFirewallUserIds(accountKey);
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('firewall_rules')
      .delete()
      .eq('id', ruleId)
      .in('user_id', userIds)
      .select('id');

    if (error) {
      throw new Error(`Failed to delete firewall rule: ${error.message}`);
    }

    return (data || []).length > 0;
  }

  const store = readRulesFromFile();
  const before = store.rules.length;
  store.rules = store.rules.filter(
    (rule) => !(rule.id === ruleId && userIds.includes(rule.userId)),
  );

  if (store.rules.length === before) {
    return false;
  }

  writeRulesToFile(store);
  return true;
}

module.exports = {
  RULES_PATH,
  VALID_RULE_TYPES,
  VALID_ACTION_EFFECTS,
  ACTION_PRIORITY,
  listFirewallRules,
  createFirewallRule,
  deleteFirewallRule,
  resolveFirewallUserIds,
};
