const fs = require('fs');
const path = require('path');

const KNOWLEDGE_BASE_PATH = path.join(__dirname, 'knowledgebase.txt');

let cachedKnowledgeBase = null;

function loadKnowledgeBase() {
  if (cachedKnowledgeBase !== null) {
    return cachedKnowledgeBase;
  }

  cachedKnowledgeBase = fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf8').trim();
  return cachedKnowledgeBase;
}

module.exports = { loadKnowledgeBase, KNOWLEDGE_BASE_PATH };
