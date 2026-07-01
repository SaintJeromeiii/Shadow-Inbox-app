const { loadKnowledgeBase } = require('./knowledgeBase');
const { retrieveRelevantMemoriesForText } = require('./memoryEngine');

const { API_KEY, API_URL, MODEL } = require('./openaiConfig');
const REQUEST_TIMEOUT_MS = 30_000;

const QUICK_TEMPLATE =
  "Got it, thanks for reaching out. I'm looking into this and will get back to you shortly!\n\n- Jerome";

const VALID_TONES = new Set(['casual', 'direct', 'professional', 'quick_template']);

const TONE_INSTRUCTIONS = {
  casual: `Rewrite the draft in a relaxed, human tone — warm but still efficient. Use contractions. Sound like Jerome typing a quick note to a colleague, not a formal letter.`,
  direct: `Rewrite the draft to be blunt and minimal. Lead with the answer or next step. Strip filler, pleasantries, and softening language. Maximum clarity in fewest words.`,
  professional: `Rewrite the draft in Jerome's polished program-analyst voice: sharp, concise, confident, and send-ready. Match the Communication Tone rules in the knowledge base.`,
};

function buildSystemPrompt(tone, memoryPromptBlock = '') {
  const knowledgeBase = loadKnowledgeBase();
  const memorySection = memoryPromptBlock
    ? `\n\n${memoryPromptBlock}\n\nWhen rewriting, use relevant past conversations to sound naturally context-aware (follow-ups, recurring bugs, prior commitments).`
    : '';
  return `You are Jerome's executive email drafting assistant for Shadow Inbox.

Your job: rewrite an existing reply draft to match the requested tone while preserving factual commitments, dates, and next steps.

Rules:
- Write as Jerome in first person.
- Keep the same core meaning and commitments as the current draft.
- Return ONLY the rewritten email body text — no quotes, markdown fences, or commentary.
- 1–4 short sentences unless the original draft requires bullets.
- Never use AI boilerplate ("I hope this finds you well", "Certainly!", "I'd be happy to").
- Sign off simply when appropriate (e.g. "- Jerome" only if the original had a sign-off).

Tone instruction:
${TONE_INSTRUCTIONS[tone]}

Knowledge base (persona, projects, phrasing rules — must stay accurate):
"""
${knowledgeBase}
"""${memorySection}`;
}

function buildUserPrompt({ originalMessage, currentDraft, emailId }) {
  return `Email ID: ${emailId}

Original incoming message:
"""
${originalMessage}
"""

Current draft to rewrite:
"""
${currentDraft}
"""`;
}

function fallbackRedraft(currentDraft, tone) {
  if (!currentDraft?.trim()) {
    return tone === 'quick_template' ? QUICK_TEMPLATE : 'On it — I will follow up shortly.\n\n- Jerome';
  }

  if (tone === 'direct') {
    return currentDraft
      .replace(/\b(I hope this finds you well|Thanks for reaching out|Please let me know)[^.!?]*[.!?]\s*/gi, '')
      .trim();
  }

  if (tone === 'casual') {
    return currentDraft.replace(/\b(I will|I am|I have)\b/g, (match) => {
      const map = { 'I will': "I'll", 'I am': "I'm", 'I have': "I've" };
      return map[match] || match;
    });
  }

  return currentDraft;
}

async function callRedraftLlm({
  originalMessage,
  currentDraft,
  emailId,
  tone,
  memoryPromptBlock = '',
}) {
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
        temperature: tone === 'direct' ? 0.15 : 0.35,
        messages: [
          { role: 'system', content: buildSystemPrompt(tone, memoryPromptBlock) },
          {
            role: 'user',
            content: buildUserPrompt({ originalMessage, currentDraft, emailId }),
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Redraft LLM request failed.');
    }

    const draft = payload?.choices?.[0]?.message?.content?.trim();
    if (!draft) {
      throw new Error('Redraft LLM returned an empty response.');
    }

    return draft;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function redraftReply({
  accountKey,
  emailId,
  originalMessage,
  currentDraft,
  tone,
}) {
  const normalizedTone = String(tone || 'professional').toLowerCase();
  if (!VALID_TONES.has(normalizedTone)) {
    throw new Error(`Invalid tone "${tone}".`);
  }

  if (normalizedTone === 'quick_template') {
    return {
      draft: QUICK_TEMPLATE,
      tone: normalizedTone,
      mode: 'template',
    };
  }

  const safeDraft = String(currentDraft || '').trim();
  if (!safeDraft) {
    throw new Error('A current draft is required to redraft with AI.');
  }

  if (!API_KEY || API_KEY.includes('your_')) {
    return {
      draft: fallbackRedraft(safeDraft, normalizedTone),
      tone: normalizedTone,
      mode: 'fallback',
    };
  }

  let memoryRetrieval = { injected: false, promptBlock: '' };
  if (accountKey) {
    try {
      memoryRetrieval = await retrieveRelevantMemoriesForText(
        accountKey,
        String(originalMessage || ''),
        { excludeId: emailId },
      );
    } catch (memoryError) {
      console.warn('[Redraft] Memory retrieval failed:', memoryError);
    }
  }

  try {
    const draft = await callRedraftLlm({
      originalMessage: String(originalMessage || ''),
      currentDraft: safeDraft,
      emailId,
      tone: normalizedTone,
      memoryPromptBlock: memoryRetrieval.promptBlock,
    });

    return {
      draft,
      tone: normalizedTone,
      mode: 'live',
      memoryContext: memoryRetrieval.injected
        ? { injected: true, matchCount: memoryRetrieval.matches?.length || 0 }
        : undefined,
    };
  } catch (error) {
    console.warn('[Redraft] LLM failed, using fallback:', error);
    return {
      draft: fallbackRedraft(safeDraft, normalizedTone),
      tone: normalizedTone,
      mode: 'fallback',
      warning: error instanceof Error ? error.message : 'Redraft failed.',
    };
  }
}

module.exports = {
  QUICK_TEMPLATE,
  redraftReply,
};
