const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSupabase } = require('./supabaseClient');

const LOGS_PATH = path.join(__dirname, 'data', 'automation_logs.json');

const LOG_STATUSES = new Set([
  'pending',
  'processing',
  'completed',
  'failed',
  'dead_letter',
]);

const MAX_RELAY_RETRIES = 3;

function readLogsFromFile() {
  try {
    const raw = fs.readFileSync(LOGS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: parsed?.version || 1,
      logs: Array.isArray(parsed?.logs) ? parsed.logs : [],
    };
  } catch {
    return { version: 1, logs: [] };
  }
}

function writeLogsToFile(store) {
  fs.mkdirSync(path.dirname(LOGS_PATH), { recursive: true });
  fs.writeFileSync(LOGS_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function buildLogId() {
  return crypto.randomUUID();
}

function rowToLog(row) {
  return {
    id: row.id,
    messageId: row.message_id,
    accountKey: row.account_key,
    eventType: row.event_type,
    status: row.status,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    payload: row.payload || {},
    resultPayload: row.result_payload || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function logToRow(log) {
  return {
    id: log.id,
    message_id: log.messageId,
    account_key: log.accountKey,
    event_type: log.eventType,
    status: log.status,
    error_message: log.errorMessage ?? null,
    retry_count: log.retryCount ?? 0,
    payload: log.payload || {},
    result_payload: log.resultPayload ?? null,
    created_at: log.createdAt,
    updated_at: log.updatedAt,
  };
}

function normalizeStatus(status) {
  const value = String(status || 'pending').trim();
  return LOG_STATUSES.has(value) ? value : 'pending';
}

async function getLogById(id) {
  const key = String(id || '').trim();
  if (!key) return null;

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('automation_logs')
      .select('*')
      .eq('id', key)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to read automation log: ${error.message}`);
    }

    return data ? rowToLog(data) : null;
  }

  const store = readLogsFromFile();
  const match = store.logs.find((item) => item.id === key);
  return match || null;
}

async function getLogByMessageId(messageId) {
  const key = String(messageId || '').trim();
  if (!key) return null;

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('automation_logs')
      .select('*')
      .eq('message_id', key)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to read automation log: ${error.message}`);
    }

    return data ? rowToLog(data) : null;
  }

  const store = readLogsFromFile();
  const match = store.logs.find((item) => item.messageId === key);
  return match || null;
}

async function upsertLog(input) {
  const now = new Date().toISOString();
  const existing = input.messageId ? await getLogByMessageId(input.messageId) : null;
  const log = {
    id: existing?.id || input.id || buildLogId(),
    messageId: String(input.messageId || existing?.messageId || '').trim(),
    accountKey: input.accountKey || existing?.accountKey || 'personal',
    eventType: input.eventType || existing?.eventType || 'inbound_webhook',
    status: normalizeStatus(input.status || existing?.status || 'pending'),
    errorMessage:
      input.errorMessage !== undefined ? input.errorMessage : existing?.errorMessage ?? null,
    retryCount:
      input.retryCount !== undefined ? input.retryCount : existing?.retryCount ?? 0,
    payload: input.payload !== undefined ? input.payload : existing?.payload || {},
    resultPayload:
      input.resultPayload !== undefined ? input.resultPayload : existing?.resultPayload ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (!log.messageId) {
    throw new Error('automation log requires messageId');
  }

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('automation_logs')
      .upsert(logToRow(log), { onConflict: 'message_id' })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to upsert automation log: ${error.message}`);
    }

    return rowToLog(data);
  }

  const store = readLogsFromFile();
  const index = store.logs.findIndex((item) => item.messageId === log.messageId);
  if (index >= 0) {
    store.logs[index] = log;
  } else {
    store.logs.unshift(log);
  }
  writeLogsToFile(store);
  return log;
}

async function updateLogByMessageId(messageId, patch) {
  const existing = await getLogByMessageId(messageId);
  if (!existing) {
    return upsertLog({ messageId, ...patch });
  }

  return upsertLog({
    messageId,
    accountKey: patch.accountKey ?? existing.accountKey,
    eventType: patch.eventType ?? existing.eventType,
    status: patch.status ?? existing.status,
    errorMessage: patch.errorMessage !== undefined ? patch.errorMessage : existing.errorMessage,
    retryCount: patch.retryCount !== undefined ? patch.retryCount : existing.retryCount,
    payload: patch.payload !== undefined ? patch.payload : existing.payload,
    resultPayload:
      patch.resultPayload !== undefined ? patch.resultPayload : existing.resultPayload,
  });
}

async function updateLogById(id, patch) {
  const existing = await getLogById(id);
  if (!existing) {
    throw new Error(`Automation log not found: ${id}`);
  }

  const now = new Date().toISOString();
  const log = {
    ...existing,
    accountKey: patch.accountKey ?? existing.accountKey,
    eventType: patch.eventType ?? existing.eventType,
    status: patch.status !== undefined ? normalizeStatus(patch.status) : existing.status,
    errorMessage: patch.errorMessage !== undefined ? patch.errorMessage : existing.errorMessage,
    retryCount: patch.retryCount !== undefined ? patch.retryCount : existing.retryCount,
    payload: patch.payload !== undefined ? patch.payload : existing.payload,
    resultPayload:
      patch.resultPayload !== undefined ? patch.resultPayload : existing.resultPayload,
    updatedAt: now,
  };

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('automation_logs')
      .update(logToRow(log))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update automation log: ${error.message}`);
    }

    return rowToLog(data);
  }

  const store = readLogsFromFile();
  const index = store.logs.findIndex((item) => item.id === id);
  if (index >= 0) {
    store.logs[index] = log;
    writeLogsToFile(store);
  }
  return log;
}

async function listAutomationLogs(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const statusFilter = options.status ? normalizeStatus(options.status) : null;
  const accountKey = options.accountKey ? String(options.accountKey).trim() : null;

  const supabase = getSupabase();
  if (supabase) {
    let query = supabase
      .from('automation_logs')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }
    if (accountKey) {
      query = query.eq('account_key', accountKey);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list automation logs: ${error.message}`);
    }

    return (data || []).map(rowToLog);
  }

  const store = readLogsFromFile();
  let logs = [...store.logs];
  if (statusFilter) {
    logs = logs.filter((item) => item.status === statusFilter);
  }
  if (accountKey) {
    logs = logs.filter((item) => item.accountKey === accountKey);
  }

  logs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return logs.slice(0, limit);
}

async function resetDeadLetterLog(id) {
  const existing = await getLogById(id);
  if (!existing) {
    throw new Error(`Automation log not found: ${id}`);
  }
  if (existing.status !== 'dead_letter') {
    throw new Error('Only dead_letter logs can be reset for replay.');
  }

  return updateLogById(id, {
    status: 'pending',
    retryCount: 0,
    errorMessage: null,
    resultPayload: null,
  });
}

function isDeadLetter(log) {
  return log?.status === 'dead_letter' || (log?.status === 'failed' && log.retryCount >= MAX_RELAY_RETRIES);
}

function shouldSkipCompletedInbound(log) {
  return log?.status === 'completed';
}

function shouldSkipInFlightInbound(log) {
  return log?.status === 'processing';
}

function buildRelayMessageId(accountKey, notificationId, replyText) {
  const digest = crypto
    .createHash('sha256')
    .update(`${accountKey}:${notificationId}:${String(replyText || '').trim()}`)
    .digest('hex')
    .slice(0, 16);
  return `relay:${accountKey}:${notificationId}:${digest}`;
}

function relayBackoffMs(retryCount) {
  return Math.min(250 * 2 ** Math.max(retryCount - 1, 0), 2000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  MAX_RELAY_RETRIES,
  LOG_STATUSES,
  getLogById,
  getLogByMessageId,
  upsertLog,
  updateLogByMessageId,
  updateLogById,
  listAutomationLogs,
  resetDeadLetterLog,
  isDeadLetter,
  shouldSkipCompletedInbound,
  shouldSkipInFlightInbound,
  buildRelayMessageId,
  relayBackoffMs,
  sleep,
};
