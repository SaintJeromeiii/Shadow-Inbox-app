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
const MULTIMODAL_REQUEST_TIMEOUT_MS = 60_000;

const VALID_CATEGORIES = new Set(['action_required', 'fyi', 'ignore']);

const ATTACHMENT_TRIAGE_INSTRUCTIONS = `
When image or PDF attachment content is included:
- Analyze screenshots for UI layout issues, broken states, missing elements, and tester-reported visual bugs.
- Extract error codes, stack traces, log lines, HTTP status codes, and version/build numbers from images or PDF text.
- Blend attachment findings into cleanSummary and suggestedReply when they change urgency or required action.
- Mention the attachment insight briefly in cleanSummary when it is the primary signal (e.g. "Screenshot shows crash on login").`;

const MEMORY_TRIAGE_INSTRUCTIONS = `
When relevant past conversations are provided:
- Use them to detect follow-ups, recurring issues, and prior commitments from the same sender or topic.
- Write suggestedReply with natural continuity (e.g., "Following up on the bug you mentioned last Tuesday…").
- Do not invent history that is not supported by the past conversation block.`;

const CALENDAR_TRIAGE_INSTRUCTIONS = `
Scan the incoming message for scheduling intent — proposed meetings, dates, or phrases like "next Tuesday", "this afternoon", or "are you free at 3?".

When --- CALENDAR AVAILABILITY --- is provided:
- If STATUS is FREE, suggestedReply must confirm the proposed time warmly and confidently.
- If STATUS is CONFLICT, suggestedReply must acknowledge the conflict and offer 1-2 alternative open blocks from the availability section.
- Never invent calendar facts outside the availability block.`;

const BASE_SYSTEM_PROMPT = `You are the central intelligence router for Jerome's personal Shadow Inbox.
Respond with ONLY valid JSON using schema:
{
  "category": "action_required" | "fyi" | "ignore",
  "cleanSummary": "one sharp sentence",
  "suggestedReply": "string or null",
  "urgencyScore": 1-10,
  "actionItems": [
    {
      "title": "short imperative task Jerome must do",
      "project": "AlphaRounds | DealShield | ServiceLog | Work | General",
      "dueHint": "optional deadline phrase or null"
    }
  ]
}

Extract 0-4 actionItems from explicit asks ("review logs by Friday") and implicit obligations (reports, follow-ups, tester bugs).
Use project names when the email references Shadow Inbox apps or portfolio work; otherwise "General".

Urgency bands:
- 7-10 = high priority (blocking issues, urgent tester bugs, same-day deadlines)
- 4-6 = medium priority
- 1-3 = low priority
${ATTACHMENT_TRIAGE_INSTRUCTIONS}
${MEMORY_TRIAGE_INSTRUCTIONS}
${CALENDAR_TRIAGE_INSTRUCTIONS}`;

function buildSystemPrompt(memoryPromptBlock = '', calendarPromptBlock = '') {
  const knowledgeBase = loadKnowledgeBase();
  const memorySection = memoryPromptBlock
    ? `\n\n${memoryPromptBlock}`
    : '';
  const calendarSection = calendarPromptBlock
    ? `\n\n${calendarPromptBlock}`
    : '';
  return `${BASE_SYSTEM_PROMPT}\n\nKnowledge base:\n"""\n${knowledgeBase}\n"""${memorySection}${calendarSection}`;
}

function extractSubject(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match ? match[1].trim() : '(no subject)';
}

function simulateTriage(notification, attachmentContent = null) {
  const text = `${notification.rawText} ${notification.sender}`.toLowerCase();
  const subject = extractSubject(notification.rawText).toLowerCase();
  const hasAttachment =
    attachmentContent?.hasContent || notification.attachmentScan?.labels?.length;

  if (/newsletter|unsubscribe|promo|marketing|sale ends/.test(text)) {
    return {
      category: 'ignore',
      cleanSummary: 'Low-priority marketing or newsletter noise.',
      suggestedReply: null,
      urgencyScore: 2,
      actionItems: [],
    };
  }

  if (
    /\btest\b|action required|please respond|asap|urgent|blocking|review/.test(text) ||
    /\btest\b/.test(subject) ||
    hasAttachment
  ) {
    return {
      category: 'action_required',
      cleanSummary: hasAttachment
        ? 'Attachment included — review screenshot/PDF details and respond.'
        : 'Requires Jerome to respond or take action.',
      suggestedReply: 'On it — I will follow up shortly.',
      urgencyScore: hasAttachment ? 8 : 8,
      actionItems: [
        {
          title: hasAttachment
            ? 'Review attached screenshot/PDF and respond to sender'
            : 'Respond to sender and close the loop',
          project: 'General',
          dueHint: null,
        },
      ],
    };
  }

  return {
    category: 'fyi',
    cleanSummary: 'Informational update with no immediate response needed.',
    suggestedReply: null,
    urgencyScore: 4,
    actionItems: [],
  };
}

function normalizeActionItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const title = String(item?.title || item?.text || '').trim();
      if (!title) return null;
      return {
        title: title.slice(0, 240),
        project: item?.project ? String(item.project).trim().slice(0, 80) : 'General',
        dueHint: item?.dueHint ? String(item.dueHint).trim().slice(0, 80) : null,
      };
    })
    .filter(Boolean)
    .slice(0, 4);
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
      actionItems: normalizeActionItems(parsed.actionItems),
    };
  } catch {
    return null;
  }
}

function buildUserMessageContent(notification, attachmentContent) {
  const baseText = `Source: ${notification.sourceApp}\nFrom: ${notification.sender}\nJerome: ${USER_EMAIL}\n\n${notification.rawText}`;
  const images = attachmentContent?.images || [];
  const pdfs = attachmentContent?.pdfs || [];

  if (images.length === 0 && pdfs.length === 0) {
    return baseText;
  }

  const parts = [{ type: 'text', text: baseText }];

  for (const pdf of pdfs) {
    parts.push({
      type: 'text',
      text: `PDF attachment "${pdf.filename}":\n"""\n${pdf.text}\n"""`,
    });
  }

  for (const image of images) {
    parts.push({
      type: 'image_url',
      image_url: {
        url: `data:${image.mimeType};base64,${image.base64}`,
        detail: 'low',
      },
    });
  }

  return parts;
}

async function callLlmApi(
  notification,
  attachmentContent = null,
  memoryPromptBlock = '',
  calendarPromptBlock = '',
) {
  const images = attachmentContent?.images || [];
  const hasMultimodal = images.length > 0 || (attachmentContent?.pdfs || []).length > 0;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    hasMultimodal ? MULTIMODAL_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
  );

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
          { role: 'system', content: buildSystemPrompt(memoryPromptBlock, calendarPromptBlock) },
          {
            role: 'user',
            content: buildUserMessageContent(notification, attachmentContent),
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

async function triageNotification(
  notification,
  attachmentContent = null,
  memoryPromptBlock = '',
  calendarPromptBlock = '',
) {
  if (!API_KEY || API_KEY.includes('your_')) {
    return simulateTriage(notification, attachmentContent);
  }

  try {
    return await callLlmApi(
      notification,
      attachmentContent,
      memoryPromptBlock,
      calendarPromptBlock,
    );
  } catch (error) {
    console.warn('[ServerTriage] Falling back to simulation:', error);
    return simulateTriage(notification, attachmentContent);
  }
}

module.exports = {
  triageNotification,
  simulateTriage,
};
