const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEMORY_PATH = path.join(__dirname, 'vector_memory.json');
const MAX_MEMORY_ENTRIES = 2000;
const TOP_K = 3;
const MIN_SIMILARITY_SCORE = 0.32;
const LOCAL_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const OPENAI_EMBEDDING_MODEL =
  process.env.MEMORY_EMBEDDING_MODEL || 'text-embedding-3-small';
const OPENAI_EMBEDDING_URL =
  process.env.OPENAI_EMBEDDING_URL || 'https://api.openai.com/v1/embeddings';
const API_KEY =
  process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

let embedderPipeline = null;
let embedderInitPromise = null;

function readMemoryStore() {
  try {
    if (!fs.existsSync(MEMORY_PATH)) {
      return { version: 1, entries: [] };
    }

    const parsed = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
    return {
      version: 1,
      entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
    };
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeMemoryStore(store) {
  fs.writeFileSync(MEMORY_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function extractSubject(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match?.[1]?.trim() || '(no subject)';
}

function extractBody(rawText) {
  const lines = String(rawText || '').split('\n');
  const subjectIndex = lines.findIndex((line) => /^Subject:\s*/i.test(line));
  const bodyLines = subjectIndex >= 0 ? lines.slice(subjectIndex + 1) : lines;
  return bodyLines.join('\n').trim();
}

function buildMemoryDocument(notification, triage = null) {
  const subject = extractSubject(notification.rawText);
  const body = extractBody(notification.rawText).slice(0, 2000);
  const summary = triage?.cleanSummary?.trim() || '';

  return [
    `From: ${notification.sender}`,
    `Subject: ${subject}`,
    summary ? `Summary: ${summary}` : '',
    body ? `Body: ${body}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function shouldPreferOpenAiEmbeddings() {
  const mode = String(process.env.MEMORY_EMBEDDING_MODE || 'auto').toLowerCase();
  if (mode === 'openai') return true;
  if (mode === 'local') return false;
  return Boolean(API_KEY && !API_KEY.includes('your_'));
}

async function getLocalEmbedder() {
  if (embedderPipeline) return embedderPipeline;
  if (!embedderInitPromise) {
    embedderInitPromise = (async () => {
      const { pipeline } = await import('@xenova/transformers');
      console.log(`[Memory] Loading local embedding model (${LOCAL_EMBEDDING_MODEL})…`);
      embedderPipeline = await pipeline('feature-extraction', LOCAL_EMBEDDING_MODEL, {
        quantized: true,
      });
      console.log('[Memory] Local embedding model ready.');
      return embedderPipeline;
    })().catch((error) => {
      embedderInitPromise = null;
      throw error;
    });
  }

  return embedderInitPromise;
}

function normalizeVector(vector) {
  const values = Array.from(vector);
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return values;
  return values.map((value) => value / magnitude);
}

async function embedWithLocalModel(text) {
  const extractor = await getLocalEmbedder();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return normalizeVector(output.data);
}

async function embedWithOpenAi(text) {
  const response = await fetch(OPENAI_EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'OpenAI embedding request failed.');
  }

  const vector = payload?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('OpenAI embedding response was empty.');
  }

  return normalizeVector(vector);
}

async function generateEmbedding(text) {
  const input = String(text || '').trim();
  if (!input) {
    throw new Error('Cannot embed empty text.');
  }

  if (shouldPreferOpenAiEmbeddings()) {
    try {
      const vector = await embedWithOpenAi(input);
      return { vector, model: OPENAI_EMBEDDING_MODEL, provider: 'openai' };
    } catch (error) {
      console.warn('[Memory] OpenAI embedding failed, falling back to local model:', error);
    }
  }

  const vector = await embedWithLocalModel(input);
  return { vector, model: LOCAL_EMBEDDING_MODEL, provider: 'local' };
}

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;

  let dot = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
  }

  return dot;
}

function formatTimestamp(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Unknown date';
  }
}

function formatMemoryPromptBlock(matches) {
  if (!matches.length) return '';

  const lines = matches.map((match, index) => {
    const entry = match.entry;
    return `${index + 1}. [${formatTimestamp(entry.timestamp)}] From: ${entry.sender} | Subject: ${entry.subject}
   Summary: ${entry.summary || 'No summary saved.'}
   Snippet: ${entry.snippet}`;
  });

  return `--- RELEVANT PAST CONVERSATIONS ---
Use these only when they clearly relate to the current email thread, sender, or topic.
Reference prior context naturally in suggestedReply when helpful (e.g., follow-ups, recurring bugs, prior commitments).

${lines.join('\n\n')}`;
}

function applyMemoryContext(notification, retrieval) {
  if (!retrieval?.injected) {
    return notification;
  }

  return {
    ...notification,
    memoryContext: {
      injected: true,
      matchCount: retrieval.matches.length,
    },
  };
}

async function retrieveRelevantMemories(accountKey, notification, options = {}) {
  const excludeId = options.excludeId || notification?.id;
  const topK = options.topK || TOP_K;
  const store = readMemoryStore();
  const accountEntries = store.entries.filter(
    (entry) =>
      entry.id !== excludeId &&
      (entry.accountKey === accountKey ||
        entry.accountKey === '_global' ||
        entry.kind === 'knowledge_snippet'),
  );

  if (accountEntries.length === 0) {
    return { matches: [], injected: false, promptBlock: '' };
  }

  const queryDocument = buildMemoryDocument(notification);
  const { vector: queryVector } = await generateEmbedding(queryDocument);

  const ranked = accountEntries
    .map((entry) => ({
      entry,
      score: cosineSimilarity(queryVector, entry.embedding),
    }))
    .filter((item) => item.score >= MIN_SIMILARITY_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const promptBlock = formatMemoryPromptBlock(ranked);

  return {
    matches: ranked,
    injected: ranked.length > 0,
    promptBlock,
  };
}

async function retrieveRelevantMemoriesForText(accountKey, text, options = {}) {
  return retrieveRelevantMemories(
    accountKey,
    {
      id: options.excludeId || '__query__',
      sender: 'Unknown',
      rawText: String(text || ''),
      timestamp: new Date().toISOString(),
    },
    options,
  );
}

async function saveMemoryEntry(accountKey, notification, triage) {
  if (!notification?.id || !triage) return null;

  const document = buildMemoryDocument(notification, triage);
  const { vector, model, provider } = await generateEmbedding(document);
  const store = readMemoryStore();

  const entry = {
    id: notification.id,
    accountKey,
    notificationId: notification.id,
    sender: notification.sender,
    subject: extractSubject(notification.rawText),
    summary: triage.cleanSummary || '',
    snippet: extractBody(notification.rawText).slice(0, 280),
    timestamp: notification.timestamp || new Date().toISOString(),
    category: triage.category,
    embedding: vector,
    embeddingModel: model,
    embeddingProvider: provider,
    updatedAt: new Date().toISOString(),
  };

  const withoutCurrent = store.entries.filter((item) => item.id !== entry.id);
  withoutCurrent.push(entry);

  const trimmed =
    withoutCurrent.length > MAX_MEMORY_ENTRIES
      ? withoutCurrent
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          )
          .slice(0, MAX_MEMORY_ENTRIES)
      : withoutCurrent;

  writeMemoryStore({ version: 1, entries: trimmed });
  return entry;
}

async function ingestKnowledgeSnippet({ text, timestamp, memoryId }) {
  const snippet = String(text || '').trim();
  if (!snippet) {
    throw new Error('Knowledge snippet is required for vector ingestion.');
  }

  const resolvedTimestamp = timestamp || new Date().toISOString();
  const document = `Core Knowledge Update [${resolvedTimestamp}]\n${snippet}`;
  const { vector, model, provider } = await generateEmbedding(document);
  const store = readMemoryStore();
  const entryId =
    memoryId ||
    `knowledge-${crypto
      .createHash('sha1')
      .update(`${resolvedTimestamp}:${snippet}`)
      .digest('hex')
      .slice(0, 12)}`;

  const entry = {
    id: entryId,
    kind: 'knowledge_snippet',
    accountKey: '_global',
    notificationId: null,
    sender: 'Jerome',
    subject: 'Core Knowledge Update',
    summary: snippet.slice(0, 240),
    snippet: snippet.slice(0, 280),
    timestamp: resolvedTimestamp,
    category: 'knowledge',
    embedding: vector,
    embeddingModel: model,
    embeddingProvider: provider,
    updatedAt: new Date().toISOString(),
  };

  const withoutCurrent = store.entries.filter((item) => item.id !== entryId);
  withoutCurrent.push(entry);

  const trimmed =
    withoutCurrent.length > MAX_MEMORY_ENTRIES
      ? withoutCurrent
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          )
          .slice(0, MAX_MEMORY_ENTRIES)
      : withoutCurrent;

  writeMemoryStore({ version: 1, entries: trimmed });

  console.log(`[Memory] Ingested knowledge snippet (${entryId}).`);
  return entry;
}

module.exports = {
  MEMORY_PATH,
  buildMemoryDocument,
  generateEmbedding,
  retrieveRelevantMemories,
  retrieveRelevantMemoriesForText,
  saveMemoryEntry,
  ingestKnowledgeSnippet,
  formatMemoryPromptBlock,
  applyMemoryContext,
};
