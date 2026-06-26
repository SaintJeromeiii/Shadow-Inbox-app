const fs = require('fs');
const path = require('path');
const { loadKnowledgeBase } = require('./knowledgeBase');
const { retrieveRelevantMemoriesForText } = require('./memoryEngine');

const API_KEY =
  process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const API_URL =
  process.env.LLM_API_URL ||
  process.env.EXPO_PUBLIC_LLM_API_URL ||
  'https://api.openai.com/v1/chat/completions';
const WHISPER_URL =
  process.env.WHISPER_API_URL || 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';
const MODEL =
  process.env.LLM_MODEL || process.env.EXPO_PUBLIC_LLM_MODEL || 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 45_000;

function buildVoiceSystemPrompt(memoryPromptBlock = '') {
  const knowledgeBase = loadKnowledgeBase();
  const memorySection = memoryPromptBlock ? `\n\n${memoryPromptBlock}` : '';

  return `You are Jerome's executive email drafting assistant for Shadow Inbox.

The user spoke a verbal instruction to reshape their reply draft. Rewrite the draft to precisely fulfill that spoken intent.

Rules:
- Write as Jerome in first person.
- Return ONLY the rewritten email body text — no quotes, markdown fences, or commentary.
- Keep the draft send-ready, concise, and aligned with Jerome's program-analyst voice.
- Honor deadlines, names, and commitments mentioned in the verbal instruction.
- Never use AI boilerplate ("I hope this finds you well", "Certainly!", "I'd be happy to").
- Sign off simply when appropriate (e.g. "- Jerome" only if the original draft had a sign-off).

Knowledge base (persona, projects, phrasing rules — must stay accurate):
"""
${knowledgeBase}
"""${memorySection}`;
}

function buildVoiceUserPrompt({
  originalMessage,
  currentDraft,
  emailId,
  transcription,
}) {
  return `Email ID: ${emailId}

Original incoming message:
"""
${originalMessage}
"""

Current draft to rewrite:
"""
${currentDraft}
"""

The user has provided a verbal instruction:
"${transcription}"

Rewrite the email draft to precisely fulfill this intent while maintaining project rules from the knowledge base.`;
}

function guessMimeType(filePath, providedMime) {
  if (providedMime) return providedMime;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.3gp') return 'audio/3gpp';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp4') return 'audio/mp4';
  return 'audio/m4a';
}

function extensionForMime(resolvedMime) {
  if (resolvedMime.includes('3gp')) return '3gp';
  if (resolvedMime.includes('wav')) return 'wav';
  if (resolvedMime.includes('mp4')) return 'mp4';
  return 'm4a';
}

async function transcribeAudioBuffer(buffer, mimeType, filename = 'voice.m4a') {
  if (!API_KEY || API_KEY.includes('your_')) {
    throw new Error('OpenAI API key is required for voice transcription.');
  }

  const resolvedMime = mimeType || 'audio/m4a';
  const extension = extensionForMime(resolvedMime);
  const safeName = filename.includes('.') ? filename : `voice.${extension}`;

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: resolvedMime }), safeName);
  form.append('model', WHISPER_MODEL);
  form.append('language', 'en');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
      body: form,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Whisper transcription failed.');
    }

    const text = String(payload?.text || '').trim();
    if (!text) {
      throw new Error('Whisper returned an empty transcription.');
    }

    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function transcribeAudioFile(filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);
  const resolvedMime = guessMimeType(filePath, mimeType);
  const extension = extensionForMime(resolvedMime);
  return transcribeAudioBuffer(buffer, resolvedMime, `voice.${extension}`);
}

async function callVoiceRedraftLlm({
  originalMessage,
  currentDraft,
  emailId,
  transcription,
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
        temperature: 0.35,
        messages: [
          { role: 'system', content: buildVoiceSystemPrompt(memoryPromptBlock) },
          {
            role: 'user',
            content: buildVoiceUserPrompt({
              originalMessage,
              currentDraft,
              emailId,
              transcription,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Voice redraft LLM request failed.');
    }

    const draft = payload?.choices?.[0]?.message?.content?.trim();
    if (!draft) {
      throw new Error('Voice redraft LLM returned an empty response.');
    }

    return draft;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function processVoiceCommand({
  accountKey,
  emailId,
  originalMessage,
  currentDraft,
  audioFilePath,
  mimeType,
}) {
  const safeDraft = String(currentDraft || '').trim();
  if (!safeDraft) {
    throw new Error('A current draft is required for voice commands.');
  }

  const transcription = await transcribeAudioFile(audioFilePath, mimeType);

  let memoryRetrieval = { injected: false, promptBlock: '' };
  if (accountKey) {
    try {
      memoryRetrieval = await retrieveRelevantMemoriesForText(
        accountKey,
        `${originalMessage}\n${transcription}`,
        { excludeId: emailId },
      );
    } catch (memoryError) {
      console.warn('[VoiceCommand] Memory retrieval failed:', memoryError);
    }
  }

  const draft = await callVoiceRedraftLlm({
    originalMessage: String(originalMessage || ''),
    currentDraft: safeDraft,
    emailId,
    transcription,
    memoryPromptBlock: memoryRetrieval.promptBlock,
  });

  return {
    draft,
    transcription,
    mode: 'live',
    memoryContext: memoryRetrieval.injected
      ? { injected: true, matchCount: memoryRetrieval.matches?.length || 0 }
      : undefined,
  };
}

module.exports = {
  transcribeAudioFile,
  transcribeAudioBuffer,
  processVoiceCommand,
};
