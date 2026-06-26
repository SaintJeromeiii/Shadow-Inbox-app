const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KNOWLEDGE_BASE_PATH = path.join(__dirname, 'knowledgebase.txt');
const LIVE_UPDATE_MARKER = '=== LIVE UPDATE [';

let cachedKnowledgeBase = null;

function invalidateKnowledgeCache() {
  cachedKnowledgeBase = null;
}

function readKnowledgeFile() {
  if (!fs.existsSync(KNOWLEDGE_BASE_PATH)) {
    return '';
  }

  return fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf8');
}

function loadKnowledgeBase() {
  if (cachedKnowledgeBase !== null) {
    return cachedKnowledgeBase;
  }

  cachedKnowledgeBase = readKnowledgeFile().trim();
  return cachedKnowledgeBase;
}

function parseLiveUpdates(content) {
  const updates = [];
  const pattern =
    /=== LIVE UPDATE \[([^\]]+)\] ===\n([\s\S]*?)(?=\n\n=== LIVE UPDATE \[|$)/g;

  let match = pattern.exec(content);
  while (match) {
    const timestamp = match[1].trim();
    const text = match[2].trim();
    if (text) {
      updates.push({
        id: crypto
          .createHash('sha1')
          .update(`${timestamp}:${text}`)
          .digest('hex')
          .slice(0, 12),
        timestamp,
        text,
      });
    }
    match = pattern.exec(content);
  }

  return updates.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

function getStructuredKnowledge() {
  const fullText = readKnowledgeFile().trim();
  const recentMemories = parseLiveUpdates(fullText);
  const baseText = fullText
    .replace(
      /\n\n=== LIVE UPDATE \[[^\]]+\] ===[\s\S]*?(?=\n\n=== LIVE UPDATE \[|$)/g,
      '',
    )
    .trim();

  const paragraphs = (baseText || fullText)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    fullText,
    paragraphs,
    recentMemories,
    updatedAt: fs.existsSync(KNOWLEDGE_BASE_PATH)
      ? fs.statSync(KNOWLEDGE_BASE_PATH).mtime.toISOString()
      : null,
  };
}

function appendKnowledgeSnippet(snippet) {
  const text = String(snippet || '').trim();
  if (!text) {
    throw new Error('Knowledge snippet is required.');
  }

  if (text.length > 4000) {
    throw new Error('Knowledge snippet is too long (max 4000 characters).');
  }

  const timestamp = new Date().toISOString();
  const block = `\n\n${LIVE_UPDATE_MARKER}${timestamp}] ===\n${text}\n`;

  fs.appendFileSync(KNOWLEDGE_BASE_PATH, block, 'utf8');
  invalidateKnowledgeCache();

  return {
    id: crypto.createHash('sha1').update(`${timestamp}:${text}`).digest('hex').slice(0, 12),
    timestamp,
    text,
  };
}

function syncKnowledgeBaseToClientBundle() {
  const sourcePath = KNOWLEDGE_BASE_PATH;
  const destPath = path.join(__dirname, '..', 'src', 'data', 'knowledgeBaseContent.ts');
  const content = readKnowledgeFile().trim();
  const output = `// Auto-generated from backend/knowledgebase.txt — edit that file, then run: npm run sync:knowledge-base

export const KNOWLEDGE_BASE_CONTENT = ${JSON.stringify(content)};
`;

  fs.writeFileSync(destPath, output, 'utf8');
}

module.exports = {
  KNOWLEDGE_BASE_PATH,
  loadKnowledgeBase,
  invalidateKnowledgeCache,
  getStructuredKnowledge,
  appendKnowledgeSnippet,
  parseLiveUpdates,
  syncKnowledgeBaseToClientBundle,
};
