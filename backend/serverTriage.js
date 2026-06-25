const { loadKnowledgeBase } = require('./knowledgeBase');

const API_KEY =
  process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const API_URL =
  process.env.LLM_API_URL ||
  process.env.EXPO_PUBLIC_LLM_API_URL ||
  'https://api.openai.com/v1/chat/completions';
const MODEL =
  process.env.LLM_MODEL || process.env.EXPO_PUBLIC_LLM_MODEL || 'gpt-4o-mini';
const USER_EMAIL = (
  process.env.EXPO_PUBLIC_USER_EMAIL ||
  process.env.IMAP_USER ||
  'jleonandersonjr@gmail.com'
).toLowerCase();
const REQUEST_TIMEOUT_MS = 30_000;

const VALID_CATEGORIES = new Set(['action_required', 'fyi', 'ignore']);

const BASE_SYSTEM_PROMPT = `You are the central intelligence router for Jerome's personal Shadow Inbox.
Respond with ONLY valid JSON using schema:
{
  "category": "action_required" | "fyi" | "ignore",
  "cleanSummary": "one sharp sentence",
  "suggestedReply": "string or null",
  "urgencyScore": 1-10
}`;

function buildSystemPrompt() {
  const knowledgeBase = loadKnowledgeBase();
  return `${BASE_SYSTEM_PROMPT}\n\nKnowledge base:\n"""\n${knowledgeBase}\n"""`;
}

function extractSubject(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match ? match[1].trim() : '(no subject)';
}

function simulateTriage(notification) {
  const text = `${notification.rawText} ${notification.sender}`.toLowerCase();
  const subject = extractSubject(notification.rawText).toLowerCase();

  if (/newsletter|unsubscribe|promo|marketing|sale ends/.test(text)) {
    return {
      category: 'ignore',
      cleanSummary: 'Low-priority marketing or newsletter noise.',
      suggestedReply: null,
      urgencyScore: 2,
    };
  }

  if (
    /\btest\b|action required|please respond|asap|urgent|blocking|review/.test(text) ||
    /\btest\b/.test(subject)
  ) {
    return {
      category: 'action_required',
      cleanSummary: 'Requires Jerome to respond or take action.',
      suggestedReply: 'On it — I will follow up shortly.',
      urgencyScore: 8,
    };
  }

  return {
    category: 'fyi',
    cleanSummary: 'Informational update with no immediate response needed.',
    suggestedReply: null,
    urgencyScore: 4,
  };
}

function parseTriageResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!VALID_CATEGORIES.has(parsed.category)) return null;
    return {
      category: parsed.category,
      cleanSummary: String(parsed.cleanSummary || '').trim(),
      suggestedReply:
        parsed.category === 'action_required' && parsed.suggestedReply
          ? String(parsed.suggestedReply).trim()
          : null,
      urgencyScore: Math.min(10, Math.max(1, Number(parsed.urgencyScore) || 5)),
    };
  } catch {
    return null;
  }
}

async function callLlmApi(notification) {
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
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          {
            role: 'user',
            content: `Source: ${notification.sourceApp}\nFrom: ${notification.sender}\nJerome: ${USER_EMAIL}\n\n${notification.rawText}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'LLM triage failed.');
    }

    const parsed = parseTriageResponse(payload?.choices?.[0]?.message?.content || '');
    if (!parsed) {
      throw new Error('Invalid LLM triage payload.');
    }
    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function triageNotification(notification) {
  if (!API_KEY || API_KEY.includes('your_')) {
    return simulateTriage(notification);
  }

  try {
    return await callLlmApi(notification);
  } catch (error) {
    console.warn('[ServerTriage] Falling back to simulation:', error);
    return simulateTriage(notification);
  }
}

module.exports = {
  triageNotification,
  simulateTriage,
};
