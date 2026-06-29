const { loadKnowledgeBase } = require('./knowledgeBase');
const { retrieveRelevantMemoriesForText } = require('./memoryEngine');

const API_KEY =
  process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const API_URL =
  process.env.LLM_API_URL ||
  process.env.EXPO_PUBLIC_LLM_API_URL ||
  'https://api.openai.com/v1/chat/completions';
const MODEL =
  process.env.LLM_MODEL || process.env.EXPO_PUBLIC_LLM_MODEL || 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 45_000;

const QUICK_REPLY_SYSTEM_PROMPT = `You are Jerome's executive reply assistant for Shadow Inbox.

Given an incoming message, produce exactly three short reply options as JSON.

Return ONLY valid JSON with this exact shape:
{
  "option1": "Acknowledge & Confirm — short, professional, direct acceptance",
  "option2": "More Info — politely ask for clarification or missing data",
  "option3": "Polite Decline/Defer — elegant boundary setting or deferral"
}

Rules:
- Write as Jerome in first person.
- Each option is 1-3 sentences, send-ready, no markdown fences.
- option1: confirm receipt and next step when appropriate.
- option2: ask one clear clarifying question or request missing detail.
- option3: decline or defer without burning bridges.
- No AI boilerplate ("I hope this finds you well", "Certainly!").
- Sign off simply with "- Jerome" only when natural for the tone.`;

function isPlaceholderApiKey(key) {
  const normalized = String(key || '').trim();
  return (
    !normalized ||
    normalized === 'YOUR_API_KEY_HERE' ||
    normalized.includes('your_openai')
  );
}

function buildFallbackQuickReplies(context) {
  const snippet = String(context || '').slice(0, 80);
  return {
    option1: `Thanks for sending this over — I received it and will follow up shortly.\n\n- Jerome`,
    option2: `Thanks for the note. Could you share a bit more detail on the timeline or what you need from me?\n\n- Jerome`,
    option3: `Thanks for reaching out. I'm tied up with priority work right now, but I can revisit this next week.\n\n- Jerome`,
    mode: 'fallback',
    warning: snippet ? 'OpenAI unavailable — using local quick reply templates.' : null,
  };
}

async function generateQuickReplies({ context, knowledgeBase = '' }) {
  const safeContext = String(context || '').trim();
  if (!safeContext) {
    throw new Error('Message context is required to generate quick replies.');
  }

  if (isPlaceholderApiKey(API_KEY)) {
    return buildFallbackQuickReplies(safeContext);
  }

  let memoryPromptBlock = '';
  try {
    const memoryRetrieval = await retrieveRelevantMemoriesForText('personal', safeContext);
    memoryPromptBlock = memoryRetrieval.promptBlock || '';
  } catch {
    // optional memory context
  }

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
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${QUICK_REPLY_SYSTEM_PROMPT}\n\nKnowledge base:\n"""\n${knowledgeBase || loadKnowledgeBase()}\n"""${memoryPromptBlock ? `\n\n${memoryPromptBlock}` : ''}`,
          },
          {
            role: 'user',
            content: `Incoming message:\n"""\n${safeContext}\n"""`,
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Quick reply generation failed.');
    }

    const raw = payload?.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('Quick reply model returned an empty response.');
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Quick reply model returned invalid JSON.');
    }

    const option1 = String(parsed.option1 || '').trim();
    const option2 = String(parsed.option2 || '').trim();
    const option3 = String(parsed.option3 || '').trim();

    if (!option1 || !option2 || !option3) {
      throw new Error('Quick reply model returned incomplete options.');
    }

    return {
      option1,
      option2,
      option3,
      mode: 'live',
      warning: null,
    };
  } catch (error) {
    console.warn('[QuickReply] LLM failed, using fallback:', error);
    return {
      ...buildFallbackQuickReplies(safeContext),
      warning:
        error instanceof Error ? error.message : 'Quick reply generation failed.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  generateQuickReplies,
  buildFallbackQuickReplies,
};
