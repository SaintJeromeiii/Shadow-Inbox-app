const { transcribeAudioBuffer } = require('./voiceCommandService');
const { appendTransaction } = require('./financeLedger');
const { appendVoiceTask } = require('./taskService');
const { appendVoiceNote, buildVoiceNoteId } = require('./voiceNotesLedger');

const API_KEY =
  process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const API_URL =
  process.env.LLM_API_URL ||
  process.env.EXPO_PUBLIC_LLM_API_URL ||
  'https://api.openai.com/v1/chat/completions';
const MODEL =
  process.env.LLM_MODEL || process.env.EXPO_PUBLIC_LLM_MODEL || 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 45_000;

const VALID_CATEGORIES = new Set(['Task', 'Note', 'Finance', 'Bug']);
const VALID_PROJECTS = new Set(['AlphaRounds', 'DealShield', 'ServiceLog', 'General']);

function normalizeCategory(value) {
  const category = String(value || 'Note').trim();
  return VALID_CATEGORIES.has(category) ? category : 'Note';
}

function normalizeProject(value) {
  const project = String(value || 'General').trim();
  return VALID_PROJECTS.has(project) ? project : 'General';
}

function buildParseSystemPrompt() {
  return `You classify spoken voice notes for Jerome's Shadow Inbox productivity system.

Return ONLY valid JSON with this exact shape:
{
  "category": "Task" | "Note" | "Finance" | "Bug",
  "project": "AlphaRounds" | "DealShield" | "ServiceLog" | "General",
  "summary": "clean punctuated summary of what was said",
  "structuredData": {}
}

Rules:
- category Task: actionable follow-up (deadline, deliverable, call someone).
- category Note: general thought, idea, or reference with no immediate action.
- category Finance: spending, invoice, subscription, refund, or budget mention.
- category Bug: software defect, crash, regression, or broken behavior.
- project: infer from product names (AlphaRounds, DealShield, ServiceLog) or default General.
- summary: concise, properly punctuated, first-person when natural.
- structuredData keys by category:
  - Finance: amount (number), merchant or vendor (string), category (string, optional)
  - Task: taskTitle (string), dueHint (string, optional)
  - Bug: severity ("low"|"medium"|"high"), component (string, optional), steps (string, optional)
  - Note: tags (string array, optional)`;
}

async function parseVoiceNoteTranscript(transcript) {
  if (!API_KEY || API_KEY.includes('your_')) {
    throw new Error('OpenAI API key is required for voice note parsing.');
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
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildParseSystemPrompt() },
          {
            role: 'user',
            content: `Transcript:\n"""${transcript}"""`,
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Voice note parsing failed.');
    }

    const raw = payload?.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('Voice note parser returned an empty response.');
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Voice note parser returned invalid JSON.');
    }

    return {
      category: normalizeCategory(parsed.category),
      project: normalizeProject(parsed.project),
      summary: String(parsed.summary || transcript).trim(),
      structuredData:
        parsed.structuredData && typeof parsed.structuredData === 'object'
          ? parsed.structuredData
          : {},
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildConfirmationMessage({ category, project, summary, structuredData, routedTo }) {
  if (category === 'Finance') {
    const amount = structuredData?.amount;
    const merchant = structuredData?.merchant || structuredData?.vendor || 'vendor';
    if (amount != null && Number.isFinite(Number(amount))) {
      return `Logged finance entry: $${Number(amount).toFixed(2)} at ${merchant} for ${project}.`;
    }
    return `Saved finance note for ${project}.`;
  }

  if (category === 'Task') {
    const title = structuredData?.taskTitle || summary;
    return `Added task: ${title}`;
  }

  if (category === 'Bug') {
    const severity = structuredData?.severity ? ` (${structuredData.severity})` : '';
    return `Logged bug${severity}: ${summary}`;
  }

  if (routedTo) {
    return `Saved ${category.toLowerCase()} to ${routedTo}.`;
  }

  return `Saved note: ${summary}`;
}

async function routeParsedVoiceNote(accountKey, voiceNoteId, parsed) {
  const { category, project, summary, structuredData } = parsed;
  const routed = [];

  if (category === 'Finance') {
    const amount = Number(structuredData?.amount);
    if (Number.isFinite(amount) && amount >= 0) {
      await appendTransaction({
        id: `tx_voice_${voiceNoteId.replace(/^vn_/, '')}`,
        amount,
        vendor: structuredData?.merchant || structuredData?.vendor || 'Voice note',
        category: structuredData?.category || 'Operational',
        projectName: project,
        sourceNotificationId: voiceNoteId,
        accountKey,
      });
      routed.push('finance_transactions');
    }
  }

  if (category === 'Task' || category === 'Bug') {
    const title =
      structuredData?.taskTitle ||
      (category === 'Bug' ? `Bug: ${summary}` : summary);
    appendVoiceTask(accountKey, {
      id: `task-${voiceNoteId}`,
      emailId: voiceNoteId,
      title,
      project,
      summary,
      source: 'voice_note',
      category,
    });
    routed.push('extracted_tasks');
  }

  return routed;
}

async function ingestVoiceNote({
  accountKey,
  audioBuffer,
  mimeType,
  originalFilename,
}) {
  const voiceNoteId = buildVoiceNoteId();
  const transcript = await transcribeAudioBuffer(
    audioBuffer,
    mimeType,
    originalFilename || 'voice.m4a',
  );

  const parsed = await parseVoiceNoteTranscript(transcript);
  const routedTo = await routeParsedVoiceNote(accountKey, voiceNoteId, parsed);

  const voiceNote = await appendVoiceNote({
    id: voiceNoteId,
    accountKey,
    category: parsed.category,
    project: parsed.project,
    summary: parsed.summary,
    transcript,
    structuredData: parsed.structuredData,
    routedTo: routedTo.length ? routedTo.join(',') : 'voice_notes',
  });

  const message = buildConfirmationMessage({
    category: parsed.category,
    project: parsed.project,
    summary: parsed.summary,
    structuredData: parsed.structuredData,
    routedTo: voiceNote.routedTo,
  });

  return {
    success: true,
    message,
    voiceNote,
    transcript,
    parsed,
  };
}

module.exports = {
  ingestVoiceNote,
  parseVoiceNoteTranscript,
};
