const { getKnowledgeForTriage } = require('./userProfileService');
const { reserveTriageQuota, DAILY_LIMIT, getDailyUsage } = require('./aiUsageService');

const API_KEY = process.env.OPENAI_API_KEY || '';
const API_URL =
  process.env.LLM_API_URL || process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = Number(process.env.TRIAGE_TIMEOUT_MS || 30_000);
const MAX_BATCH_SIZE = Number(process.env.TRIAGE_BATCH_MAX || 40);
const TRIAGE_CONCURRENCY = Number(process.env.TRIAGE_CONCURRENCY || 5);

const PLACEHOLDER_KEYS = new Set([
  '',
  'YOUR_API_KEY_HERE',
  'your_openai_or_gemini_api_key_here',
]);

const VALID_CATEGORIES = new Set(['action_required', 'fyi', 'ignore']);

function isLlmConfigured() {
  return !PLACEHOLDER_KEYS.has(String(API_KEY).trim());
}

function getTriageMode() {
  return isLlmConfigured() ? 'live' : 'simulation';
}

function buildSystemPrompt({ displayName, knowledgeText }) {
  const name = displayName || 'the user';

  return `You are the central intelligence router for ${name}'s personal Shadow Inbox.

Every output must match their voice: sharp, highly efficient, concise, and professional. No filler, no warmth-padding, no corporate fluff.

Your job:
1. Strip noise — marketing clutter, newsletters, spam, low-priority alerts.
2. Surface only what ${name} must act on or know.
3. Draft replies that are clean, brief, and direct — ready to send with minimal editing.

Categorize every item into exactly one of:
- "action_required" — requires a manual reply, decision, or task from ${name}
- "fyi" — important context ${name} should know; no action needed
- "ignore" — newsletter clutter, spam, cold sales, automated noise

Voice rules for "suggestedReply":
- Write as ${name} in first person
- Match the communication tone from the knowledge base
- 1–3 short sentences max; bullets only if essential
- Never use AI boilerplate ("I hope this finds you well", "Certainly!", "I'd be happy to", "Please don't hesitate")
- Lead with the answer or next step, not pleasantries

Respond with ONLY valid JSON — no markdown fences, no commentary.

Output schema:
{
  "category": "action_required" | "fyi" | "ignore",
  "cleanSummary": "one sharp sentence distilling the message",
  "suggestedReply": "brief direct draft if action_required, otherwise null",
  "urgencyScore": 1-10 integer
}

Rules:
- category must be exactly one of: action_required, fyi, ignore
- cleanSummary: max 20 words, active voice, zero fluff
- suggestedReply: required string only when category is action_required; must be null otherwise
- urgencyScore: integer 1–10 (10 = drop everything, 1 = trivial)

User Persona & Contextual Knowledge Base:
"""
${knowledgeText}
"""

Knowledge base rules — apply strictly on every triage:
- Cross-reference senders, projects, and topics against the knowledge base before choosing a category.
- Apply the Communication Tone and draft guidelines verbatim when writing suggestedReply.
- Personalize drafts with correct project names, relationships, and realistic next steps — never generic filler.
- If the knowledge base conflicts with generic heuristics, the knowledge base wins.`;
}

function buildUserPrompt(notification, userEmail) {
  return `Source: ${notification.sourceApp}
From: ${notification.sender}
Received: ${notification.timestamp}
User email: ${userEmail || 'unknown'}

Raw message:
"""
${notification.rawText}
"""`;
}

function isFromUser(notification, userEmail) {
  if (!userEmail) {
    return false;
  }
  return notification.sender.toLowerCase().includes(userEmail.toLowerCase());
}

function hasActionableRequest(rawText) {
  const text = rawText.toLowerCase();
  return /please|can you|need you to|action required|respond|reply|review|confirm|urgent|asap|follow[- ]?up|let me know|todo|task|waiting on|when you get a chance|need your|could you/.test(
    text,
  );
}

function isTestOrActiveTask(notification) {
  const text = notification.rawText;
  const lower = text.toLowerCase();

  if (/\btest\b/i.test(text)) {
    return true;
  }

  return /action required|todo|task|please respond|needs review|blocking|asap|urgent|follow[- ]?up|waiting on you|need your input|reply needed/.test(
    lower,
  );
}

function shouldForceActionRequired(notification, userEmail) {
  if (isTestOrActiveTask(notification)) {
    return true;
  }

  return isFromUser(notification, userEmail) && hasActionableRequest(notification.rawText);
}

function draftReply(notification) {
  const text = notification.rawText.toLowerCase();

  if (text.includes('review') || text.includes('pr #')) {
    return "On it — I'll review this today and leave comments.";
  }
  if (text.includes('pick him up') || text.includes('flight lands')) {
    return "I can handle pickup — I'll head to the terminal.";
  }
  if (text.includes('open enrollment')) {
    return "Thanks for the reminder — I'll complete my benefits elections today.";
  }
  if (text.includes('confirm') || text.includes('rsvp')) {
    return "Confirmed — I'll follow up with details shortly.";
  }
  if (text.includes('test')) {
    return "Received — I'll complete this and confirm shortly.";
  }

  return "Noted — I'll handle this and follow up today.";
}

function summarizeLocally(notification, fallback) {
  const firstLine = notification.rawText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return fallback ?? 'New notification received.';
  const cleaned = firstLine.replace(/\*\*/g, '').slice(0, 120);
  return cleaned.length < firstLine.length ? `${cleaned}…` : cleaned;
}

function applyTriageOverrides(notification, result, userEmail) {
  if (!shouldForceActionRequired(notification, userEmail)) {
    return result;
  }

  if (result.category === 'action_required') {
    return {
      ...result,
      suggestedReply: result.suggestedReply ?? draftReply(notification),
      urgencyScore: Math.max(result.urgencyScore, 7),
    };
  }

  return {
    category: 'action_required',
    cleanSummary: result.cleanSummary,
    suggestedReply: result.suggestedReply ?? draftReply(notification),
    urgencyScore: Math.max(result.urgencyScore, 7),
  };
}

function clampUrgency(score) {
  const numeric = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(numeric)) return 5;
  return Math.min(10, Math.max(1, Math.round(numeric)));
}

function parseTriageResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.category || !VALID_CATEGORIES.has(parsed.category)) {
      return null;
    }

    if (typeof parsed.cleanSummary !== 'string' || !parsed.cleanSummary.trim()) {
      return null;
    }

    const category = parsed.category;
    const suggestedReply =
      category === 'action_required' &&
      typeof parsed.suggestedReply === 'string' &&
      parsed.suggestedReply.trim()
        ? parsed.suggestedReply.trim()
        : null;

    return {
      category,
      cleanSummary: parsed.cleanSummary.trim(),
      suggestedReply,
      urgencyScore: clampUrgency(parsed.urgencyScore),
    };
  } catch {
    return null;
  }
}

function simulateTriage(notification, userEmail) {
  if (shouldForceActionRequired(notification, userEmail)) {
    return {
      category: 'action_required',
      cleanSummary: summarizeLocally(notification),
      suggestedReply: draftReply(notification),
      urgencyScore: /\btest\b/i.test(notification.rawText) ? 8 : 7,
    };
  }

  const text = notification.rawText.toLowerCase();
  const sender = notification.sender.toLowerCase();

  const isVerification =
    /verification code|your code is|\b\d{6}\b/.test(text) &&
    (sender.includes('noreply') || sender.includes('unknown'));
  const isSpam =
    /reply stop|unsubscribe|newsletter|promo|sale ends/.test(text) &&
    !text.includes('action');

  if (isVerification || isSpam) {
    return {
      category: 'ignore',
      cleanSummary: summarizeLocally(notification, 'Automated or low-priority message.'),
      suggestedReply: null,
      urgencyScore: 1,
    };
  }

  const needsAction =
    /action required|can you review|blocking|eod|pick him up|open enrollment|when you get a sec|confirm whether|leave comments|rsvp|please respond/.test(
      text,
    );

  if (needsAction) {
    const urgency = text.includes('blocking') || text.includes('eod') ? 9 : 7;
    return {
      category: 'action_required',
      cleanSummary: summarizeLocally(notification),
      suggestedReply: draftReply(notification),
      urgencyScore: urgency,
    };
  }

  const isFyi =
    /reminder|updated invitation|dropped the|office hours|no action needed|scheduled|confirmation/.test(
      text,
    );

  if (isFyi) {
    return {
      category: 'fyi',
      cleanSummary: summarizeLocally(notification),
      suggestedReply: null,
      urgencyScore: text.includes('invitation') ? 4 : 3,
    };
  }

  return applyTriageOverrides(
    notification,
    {
      category: 'fyi',
      cleanSummary: summarizeLocally(notification),
      suggestedReply: null,
      urgencyScore: 2,
    },
    userEmail,
  );
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callLlmApi(notification, context) {
  const response = await fetchWithTimeout(
    API_URL,
    {
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
          {
            role: 'system',
            content: buildSystemPrompt({
              displayName: context.displayName,
              knowledgeText: context.knowledgeText,
            }),
          },
          { role: 'user', content: buildUserPrompt(notification, context.userEmail) },
        ],
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty LLM response body');
  }

  const parsed = parseTriageResponse(content);
  if (!parsed) {
    throw new Error('LLM response could not be parsed into triage schema');
  }

  return applyTriageOverrides(notification, parsed, context.userEmail);
}

async function triageNotification(notification, accountKey) {
  const context = await getKnowledgeForTriage(accountKey);

  if (!isLlmConfigured()) {
    return {
      triage: simulateTriage(notification, context.userEmail),
      mode: 'simulation',
    };
  }

  try {
    const triage = await callLlmApi(notification, context);
    return { triage, mode: 'live' };
  } catch (error) {
    console.warn('[Triage] Live AI failed, using simulation:', error);
    return {
      triage: simulateTriage(notification, context.userEmail),
      mode: 'simulation',
      error: error instanceof Error ? error.message : 'Triage failed',
    };
  }
}

async function triageNotifications(notifications, accountKey) {
  const list = Array.isArray(notifications) ? notifications.slice(0, MAX_BATCH_SIZE) : [];
  const results = {};
  let mode = getTriageMode();

  if (list.length === 0) {
    return { results, mode, processed: 0, usage: await getDailyUsage(accountKey).then((used) => ({
      used,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - used),
    })) };
  }

  const quota = await reserveTriageQuota(accountKey, list.length);
  const batch = list.slice(0, quota.allowed);

  for (let offset = 0; offset < batch.length; offset += TRIAGE_CONCURRENCY) {
    const chunk = batch.slice(offset, offset + TRIAGE_CONCURRENCY);
    const outcomes = await Promise.all(
      chunk.map((notification) => triageNotification(notification, accountKey)),
    );

    chunk.forEach((notification, index) => {
      if (!notification?.id) {
        return;
      }
      results[notification.id] = outcomes[index].triage;
      if (outcomes[index].mode === 'simulation') {
        mode = 'simulation';
      }
    });
  }

  return {
    results,
    mode,
    processed: Object.keys(results).length,
    usage: {
      used: quota.used,
      limit: quota.limit,
      remaining: quota.remaining,
    },
    truncated: quota.allowed < list.length,
  };
}

module.exports = {
  MAX_BATCH_SIZE,
  TRIAGE_CONCURRENCY,
  DAILY_LIMIT,
  getTriageMode,
  isLlmConfigured,
  triageNotification,
  triageNotifications,
};
