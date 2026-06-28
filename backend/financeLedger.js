const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSupabase } = require('./supabaseClient');
const { resolveFinanceAccountKeys } = require('./accounts');

const LEDGER_PATH = path.join(__dirname, 'data', 'finances.json');
const VALID_PROJECTS = new Set(['AlphaRounds', 'DealShield', 'ServiceLog', 'General']);

function readLedgerFromFile() {
  try {
    const raw = fs.readFileSync(LEDGER_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: parsed?.version || 1,
      transactions: Array.isArray(parsed?.transactions) ? parsed.transactions : [],
    };
  } catch {
    return { version: 1, transactions: [] };
  }
}

function writeLedgerToFile(store) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function normalizeProject(value) {
  const project = String(value || 'General').trim();
  return VALID_PROJECTS.has(project) ? project : 'General';
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function buildTransactionId() {
  return `tx_${crypto.randomBytes(4).toString('hex')}`;
}

function rowToTransaction(row) {
  return {
    id: row.id,
    date: row.date,
    vendor: row.vendor,
    amount: Number(row.amount),
    category: row.category,
    projectName: row.project_name,
    billingDate: row.billing_date,
    sourceNotificationId: row.source_notification_id,
    accountKey: row.account_key,
    createdAt: row.created_at,
  };
}

function transactionToRow(transaction) {
  return {
    id: transaction.id,
    date: transaction.date,
    vendor: transaction.vendor,
    amount: transaction.amount,
    category: transaction.category,
    project_name: transaction.projectName,
    billing_date: transaction.billingDate,
    source_notification_id: transaction.sourceNotificationId,
    account_key: transaction.accountKey,
    created_at: transaction.createdAt,
  };
}

async function readLedger() {
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('finance_transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to read finance ledger: ${error.message}`);
    }

    return {
      version: 1,
      transactions: (data || []).map(rowToTransaction),
    };
  }

  return readLedgerFromFile();
}

async function hasTransactionForNotification(notificationId) {
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('finance_transactions')
      .select('id')
      .eq('source_notification_id', notificationId)
      .limit(1);

    if (error) {
      throw new Error(`Failed to check finance transaction: ${error.message}`);
    }

    return (data || []).length > 0;
  }

  const store = readLedgerFromFile();
  return store.transactions.some((tx) => tx.sourceNotificationId === notificationId);
}

async function appendTransaction(input) {
  const amount = normalizeAmount(input.amount);
  if (amount === null) {
    throw new Error('Invalid transaction amount.');
  }

  const now = new Date().toISOString();
  const billingDate = String(input.billingDate || input.date || now.slice(0, 10));
  const projectName = normalizeProject(input.projectName || input.impliedProject);

  const transaction = {
    id: input.id || buildTransactionId(),
    date: billingDate,
    vendor: String(input.vendor || 'Unknown vendor').trim().slice(0, 120),
    amount,
    category: String(input.category || 'Operational').trim().slice(0, 80),
    projectName,
    billingDate,
    sourceNotificationId: input.sourceNotificationId || null,
    accountKey: input.accountKey || 'personal',
    createdAt: now,
  };

  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase
      .from('finance_transactions')
      .insert(transactionToRow(transaction));

    if (error) {
      throw new Error(`Failed to append finance transaction: ${error.message}`);
    }

    return transaction;
  }

  const store = readLedgerFromFile();
  store.transactions = [transaction, ...store.transactions];
  writeLedgerToFile(store);
  return transaction;
}

function getMonthKey(dateInput = new Date()) {
  const date = new Date(dateInput);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function isInMonth(dateString, monthKey) {
  return String(dateString || '').startsWith(monthKey);
}

async function buildFinanceSummary(options = {}) {
  const monthKey = options.monthKey || getMonthKey();
  const accountKeys = options.accountKey
    ? resolveFinanceAccountKeys(options.accountKey)
    : null;
  const store = await readLedger();

  const filtered = store.transactions.filter((tx) => {
    if (accountKeys && !accountKeys.includes(tx.accountKey)) return false;
    return isInMonth(tx.date, monthKey);
  });

  const totalMonthToDate = filtered.reduce((sum, tx) => sum + tx.amount, 0);
  const byProject = {
    AlphaRounds: 0,
    DealShield: 0,
    ServiceLog: 0,
    General: 0,
  };

  for (const tx of filtered) {
    const key = normalizeProject(tx.projectName);
    byProject[key] = Math.round((byProject[key] + tx.amount) * 100) / 100;
  }

  const transactions = [...store.transactions]
    .filter((tx) => (accountKeys ? accountKeys.includes(tx.accountKey) : true))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, options.limit || 40);

  return {
    monthKey,
    totalMonthToDate: Math.round(totalMonthToDate * 100) / 100,
    byProject,
    transactionCount: filtered.length,
    transactions,
  };
}

module.exports = {
  LEDGER_PATH,
  VALID_PROJECTS,
  readLedger,
  appendTransaction,
  hasTransactionForNotification,
  buildFinanceSummary,
  getMonthKey,
};
