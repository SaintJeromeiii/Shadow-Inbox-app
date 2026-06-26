const {
  appendTransaction,
  hasTransactionForNotification,
  VALID_PROJECTS,
} = require('./financeLedger');

const API_KEY =
  process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const API_URL =
  process.env.LLM_API_URL ||
  process.env.EXPO_PUBLIC_LLM_API_URL ||
  'https://api.openai.com/v1/chat/completions';
const MODEL =
  process.env.LLM_MODEL || process.env.EXPO_PUBLIC_LLM_MODEL || 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 25_000;

const BILLING_PATTERN =
  /\b(invoice|receipt|billing|bill statement|payment received|payment due|amount due|renewal|subscription|subscribed|charged|charge from|your order|paid|auto-pay|autopay|credit card|statement available|usage summary|tax invoice)\b/i;

const FINANCE_JSON_SCHEMA = {
  name: 'developer_expense_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      isBilling: {
        type: 'boolean',
        description: 'True only when the message is a bill, invoice, receipt, or renewal charge.',
      },
      vendor: {
        type: 'string',
        description: 'Company or service that issued the charge.',
      },
      amount: {
        type: 'number',
        description: 'Charge amount in USD as a positive number.',
      },
      billingDate: {
        type: 'string',
        description: 'ISO date YYYY-MM-DD for the charge or invoice date.',
      },
      impliedProject: {
        type: 'string',
        enum: ['AlphaRounds', 'DealShield', 'ServiceLog', 'General'],
      },
      category: {
        type: 'string',
        description: 'Expense category such as API Infrastructure or Cloud Hosting.',
      },
    },
    required: ['isBilling', 'vendor', 'amount', 'billingDate', 'impliedProject', 'category'],
  },
};

function looksLikeBillingNotification(notification) {
  const haystack = `${notification.sender}\n${notification.rawText}`.toLowerCase();
  return BILLING_PATTERN.test(haystack);
}

function inferCategory(vendor, impliedProject) {
  const vendorLower = String(vendor || '').toLowerCase();
  if (/openai|anthropic|cursor|github copilot/.test(vendorLower)) {
    return 'API Infrastructure';
  }
  if (/google cloud|aws|azure|cloudflare|vercel|render|fly\.io/.test(vendorLower)) {
    return 'Cloud Hosting';
  }
  if (/apple|google play|expo|stripe fee/.test(vendorLower)) {
    return 'Platform Fees';
  }
  if (impliedProject !== 'General') {
    return `${impliedProject} Overhead`;
  }
  return 'Operational';
}

async function callFinanceExtraction(notification) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You extract developer operational expenses from billing emails and receipts for Jerome. ' +
              'Return only structured JSON matching the schema. ' +
              'If the message is not a real charge/invoice/receipt, set isBilling=false and use amount=0, vendor="N/A", billingDate today, impliedProject=General, category="N/A". ' +
              `Valid impliedProject values: ${[...VALID_PROJECTS].join(', ')}.`,
          },
          {
            role: 'user',
            content: `Sender: ${notification.sender}\nTimestamp: ${notification.timestamp}\n\n${notification.rawText}`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: FINANCE_JSON_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Finance extraction failed.');
    }

    const content = payload?.choices?.[0]?.message?.content || '{}';
    return JSON.parse(content);
  } finally {
    clearTimeout(timeoutId);
  }
}

function fallbackExtraction(notification) {
  const text = `${notification.sender}\n${notification.rawText}`;
  const amountMatch = text.match(/\$\s?(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)/);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;

  const vendor =
    notification.sender.match(/@([^>]+)>/)?.[1]?.split('.')[0] ||
    notification.sender.split('<')[0].trim() ||
    'Unknown vendor';

  return {
    isBilling: true,
    vendor: vendor.charAt(0).toUpperCase() + vendor.slice(1),
    amount,
    billingDate: notification.timestamp.slice(0, 10),
    impliedProject: 'General',
    category: inferCategory(vendor, 'General'),
  };
}

async function maybeExtractFinance(accountKey, notification) {
  if (!notification?.id || (await hasTransactionForNotification(notification.id))) {
    return null;
  }

  if (!looksLikeBillingNotification(notification)) {
    return null;
  }

  let parsed = null;

  if (API_KEY && !API_KEY.includes('your_')) {
    try {
      parsed = await callFinanceExtraction(notification);
    } catch (error) {
      console.warn(
        `[Finance] LLM extraction failed for ${notification.id}:`,
        error instanceof Error ? error.message : error,
      );
      parsed = fallbackExtraction(notification);
    }
  } else {
    parsed = fallbackExtraction(notification);
  }

  if (!parsed?.isBilling || !parsed.amount || parsed.amount <= 0) {
    return null;
  }

  const transaction = await appendTransaction({
    vendor: parsed.vendor,
    amount: parsed.amount,
    billingDate: parsed.billingDate,
    date: parsed.billingDate,
    projectName: parsed.impliedProject,
    category: parsed.category || inferCategory(parsed.vendor, parsed.impliedProject),
    sourceNotificationId: notification.id,
    accountKey,
  });

  console.log(
    `[Finance] Logged ${transaction.vendor} $${transaction.amount} → ${transaction.projectName} (${transaction.id}).`,
  );

  return transaction;
}

module.exports = {
  looksLikeBillingNotification,
  maybeExtractFinance,
};
