const express = require('express');
const {
  getStructuredKnowledge,
  appendKnowledgeSnippet,
  syncKnowledgeBaseToClientBundle,
} = require('../knowledgeBase');
const {
  appendProfileKnowledgeSnippet,
  getStructuredProfileKnowledge,
} = require('../userProfileService');
const { ingestKnowledgeSnippet } = require('../memoryEngine');
const { resolveAccountKey } = require('../accounts');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const raw = req.headers['x-account-key'] || req.query?.accountKey || req.body?.accountKey;
  return resolveAccountKey(raw || 'personal');
}

router.get('/', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);

  try {
    const profileKnowledge = await getStructuredProfileKnowledge(accountKey);
    if (profileKnowledge.fullText?.trim()) {
      res.json({
        success: true,
        accountKey,
        fullText: profileKnowledge.fullText,
        paragraphs: profileKnowledge.paragraphs,
        recentMemories: profileKnowledge.recentMemories,
        updatedAt: profileKnowledge.updatedAt,
        source: 'profile',
      });
      return;
    }

    const knowledge = getStructuredKnowledge();
    res.json({
      success: true,
      accountKey,
      ...knowledge,
      source: 'legacy',
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to read knowledge base.',
    });
  }
});

router.post('/update', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const snippet = req.body?.snippet ?? req.body?.text ?? req.body?.update;

  if (!snippet || typeof snippet !== 'string' || !snippet.trim()) {
    res.status(400).json({ error: 'Missing or invalid "snippet" field.' });
    return;
  }

  try {
    if (accountKey !== 'personal') {
      const saved = await appendProfileKnowledgeSnippet(accountKey, snippet);
      const memoryEntry = await ingestKnowledgeSnippet({
        text: snippet.trim(),
        timestamp: new Date().toISOString(),
        memoryId: `profile-knowledge-${accountKey}`,
      });

      const knowledge = await getStructuredProfileKnowledge(accountKey);
      res.json({
        success: true,
        memory: {
          id: memoryEntry.id,
          timestamp: new Date().toISOString(),
          text: snippet.trim(),
        },
        vectorEntryId: memoryEntry.id,
        knowledge: {
          fullText: knowledge.fullText,
          paragraphs: knowledge.paragraphs,
          recentMemories: knowledge.recentMemories,
          updatedAt: knowledge.updatedAt,
        },
      });
      return;
    }

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
