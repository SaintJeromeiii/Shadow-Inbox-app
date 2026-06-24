import type { RawNotification, TriageResult, TriageCategory } from '../types/notification';
export { getSeedNotifications, getNotificationDataSource } from './notificationData';

const API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const API_URL =
  process.env.EXPO_PUBLIC_LLM_API_URL ??
  'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.EXPO_PUBLIC_LLM_MODEL ?? 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 30_000;
const USER_EMAIL = (
  process.env.EXPO_PUBLIC_USER_EMAIL ?? 'jleonandersonjr@gmail.com'
).toLowerCase();

const PLACEHOLDER_KEYS = new Set([
  '',
  'YOUR_API_KEY_HERE',
  'your_openai_or_gemini_api_key_here',
]);

const VALID_CATEGORIES: TriageCategory[] = ['action_required', 'fyi', 'ignore'];

const SYSTEM_PROMPT = `You are the central intelligence router for Jerome's personal Shadow Inbox.

Jerome is a busy program analyst and resource manager. Every output must match that voice: sharp, highly efficient, concise, and professional. No filler, no warmth-padding, no corporate fluff.

Your job:
1. Strip noise — marketing clutter, newsletters, spam, low-priority alerts.
2. Surface only what Jerome must act on or know.
3. Draft replies that are clean, brief, and direct — ready to send with minimal editing.

Categorize every item into exactly one of:
- "action_required" — requires a manual reply, decision, or task from Jerome
- "fyi" — important context Jerome should know; no action needed
- "ignore" — newsletter clutter, spam, cold sales, automated noise

Voice rules for "suggestedReply":
- Write as Jerome in first person
- Program-analyst tone: precise, calm, action-oriented
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

Critical overrides — NEVER categorize as "ignore" when:
- The sender is Jerome (${USER_EMAIL}) or clearly Jerome emailing himself, AND the body contains an actionable request
- The subject or body contains the word "Test" (any casing)
- The message looks like an active task (todo, action required, please respond, waiting on you, blocking, urgent, follow up)

In all override cases above, category MUST be "action_required" with a suggestedReply and urgencyScore >= 7.`;

export type TriageMode = 'live' | 'simulation';

export function isLlmConfigured(): boolean {
  return !PLACEHOLDER_KEYS.has(API_KEY.trim());
}

export function getTriageMode(): TriageMode {
  return isLlmConfigured() ? 'live' : 'simulation';
}

function buildUserPrompt(notification: RawNotification): string {
  return `Source: ${notification.sourceApp}
From: ${notification.sender}
Received: ${notification.timestamp}
Jerome's email: ${USER_EMAIL}

Raw message:
"""
${notification.rawText}
"""`;
}

function isFromUser(notification: RawNotification): boolean {
  const sender = notification.sender.toLowerCase();
  return sender.includes(USER_EMAIL);
}

function hasActionableRequest(rawText: string): boolean {
  const text = rawText.toLowerCase();
  return /please|can you|need you to|action required|respond|reply|review|confirm|urgent|asap|follow[- ]?up|let me know|todo|task|waiting on|when you get a chance|need your|could you/.test(
    text,
  );
}

function isTestOrActiveTask(notification: RawNotification): boolean {
  const text = notification.rawText;
  const lower = text.toLowerCase();

  if (/\btest\b/i.test(text)) {
    return true;
  }

  return /action required|todo|task|please respond|needs review|blocking|asap|urgent|follow[- ]?up|waiting on you|need your input|reply needed/.test(
    lower,
  );
}

function shouldForceActionRequired(notification: RawNotification): boolean {
  if (isTestOrActiveTask(notification)) {
    return true;
  }

  return isFromUser(notification) && hasActionableRequest(notification.rawText);
}

function applyTriageOverrides(
  notification: RawNotification,
  result: TriageResult,
): TriageResult {
  if (!shouldForceActionRequired(notification)) {
    return result;
  }

  if (result.category === 'action_required') {
    return {
      ...result,
      suggestedReply: result.suggestedReply ?? draftReply(notification),
      urgencyScore: Math.max(result.urgencyScore, 7),
    };
  }

  console.warn(
    '[Shadow Inbox] Overriding triage to action_required for self-sent/test/active-task email:',
    notification.id,
  );

  return {
    category: 'action_required',
    cleanSummary: result.cleanSummary,
    suggestedReply: result.suggestedReply ?? draftReply(notification),
    urgencyScore: Math.max(result.urgencyScore, 7),
  };
}

function clampUrgency(score: unknown): number {
  const numeric = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(numeric)) return 5;
  return Math.min(10, Math.max(1, Math.round(numeric)));
}

function parseTriageResponse(text: string): TriageResult | null {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<TriageResult>;

    if (!parsed.category || !VALID_CATEGORIES.includes(parsed.category)) {
      console.warn(
        '[Shadow Inbox] Invalid LLM category:',
        parsed.category,
      );
      return null;
    }

    if (typeof parsed.cleanSummary !== 'string' || !parsed.cleanSummary.trim()) {
      console.warn('[Shadow Inbox] LLM response missing cleanSummary.');
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
  } catch (error) {
    console.warn('[Shadow Inbox] Failed to parse LLM JSON response:', error);
    return null;
  }
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.message.toLowerCase().includes('timed out') ||
      error.message.toLowerCase().includes('timeout')
    );
  }
  return false;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
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

async function callLlmApi(notification: RawNotification): Promise<TriageResult> {
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
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(notification) },
        ],
      }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty LLM response body');
  }

  const parsed = parseTriageResponse(content);
  if (!parsed) {
    throw new Error('LLM response could not be parsed into triage schema');
  }

  return applyTriageOverrides(notification, parsed);
}

function simulateTriage(notification: RawNotification): TriageResult {
  if (shouldForceActionRequired(notification)) {
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
      cleanSummary: summarizeLocally(
        notification,
        'Automated or low-priority message.',
      ),
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

  return applyTriageOverrides(notification, {
    category: 'fyi',
    cleanSummary: summarizeLocally(notification),
    suggestedReply: null,
    urgencyScore: 2,
  });
}

function summarizeLocally(
  notification: RawNotification,
  fallback?: string,
): string {
  const firstLine = notification.rawText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return fallback ?? 'New notification received.';
  const cleaned = firstLine.replace(/\*\*/g, '').slice(0, 120);
  return cleaned.length < firstLine.length ? `${cleaned}…` : cleaned;
}

function draftReply(notification: RawNotification): string {
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

function warnSimulationFallback(reason: string, error?: unknown): void {
  console.warn(`[Shadow Inbox] Simulation Mode fallback: ${reason}`);
  if (error !== undefined) {
    console.warn('[Shadow Inbox] Fallback error detail:', error);
  }
}

export async function triageNotification(
  notification: RawNotification,
): Promise<TriageResult> {
  if (!isLlmConfigured()) {
    warnSimulationFallback(
      'EXPO_PUBLIC_OPENAI_API_KEY is missing or still set to a placeholder value.',
    );
    return simulateTriage(notification);
  }

  try {
    return await callLlmApi(notification);
  } catch (error) {
    if (isTimeoutError(error)) {
      warnSimulationFallback(
        `Live AI request timed out after ${REQUEST_TIMEOUT_MS}ms. Check network connectivity.`,
        error,
      );
    } else {
      warnSimulationFallback(
        'Live AI request failed. Check API key, endpoint URL, and network connectivity.',
        error,
      );
    }
    return simulateTriage(notification);
  }
}

export async function triageNotifications(
  notifications: RawNotification[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, TriageResult>> {
  const results = new Map<string, TriageResult>();

  for (let i = 0; i < notifications.length; i++) {
    const notification = notifications[i];
    const triage = await triageNotification(notification);
    results.set(notification.id, triage);
    onProgress?.(i + 1, notifications.length);
  }

  return results;
}
