const express = require('express');
const {
  getStructuredKnowledge,
  appendKnowledgeSnippet,
  syncKnowledgeBaseToClientBundle,
} = require('../knowledgeBase');
const { ingestKnowledgeSnippet } = require('../memoryEngine');

const router = express.Router();

router.get('/', (_req, res) => {
  try {
    const knowledge = getStructuredKnowledge();
    res.json({
      success: true,
      ...knowledge,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to read knowledge base.',
    });
  }
});

router.post('/update', async (req, res) => {
  const snippet = req.body?.snippet ?? req.body?.text ?? req.body?.update;

  if (!snippet || typeof snippet !== 'string' || !snippet.trim()) {
    res.status(400).json({ error: 'Missing or invalid "snippet" field.' });
    return;
  }

  try {
    const saved = appendKnowledgeSnippet(snippet);
    const memoryEntry = await ingestKnowledgeSnippet({
      text: saved.text,
      timestamp: saved.timestamp,
      memoryId: `knowledge-${saved.id}`,
    });

    try {
      syncKnowledgeBaseToClientBundle();
    } catch (syncError) {
      console.warn('[Knowledge] Client bundle sync failed:', syncError);
    }

    console.log(
      `[Knowledge] Live update appended (${saved.id}) — vector memory ${memoryEntry.id}.`,
    );

    res.json({
      success: true,
      memory: saved,
      vectorEntryId: memoryEntry.id,
      knowledge: getStructuredKnowledge(),
    });
  } catch (error) {
    console.error('[Knowledge] Update failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update knowledge base.',
    });
  }
});

module.exports = router;
