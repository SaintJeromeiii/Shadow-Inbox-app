const express = require('express');
const { resolveAccountKey } = require('../accounts');
const { getCharacterIdFromRequest } = require('../characterIds');
const { getPlayerStats, recordDeletions } = require('../userProgressService');
const {
  getUserProfile,
  upsertUserProfile,
  getStructuredProfileKnowledge,
} = require('../userProfileService');
const { getDailyEngagement, recordClearance } = require('../dailyProgressService');
const { getUsageSummary } = require('../aiUsageService');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const raw = req.headers['x-account-key'] || req.query?.accountKey || req.body?.accountKey;
  return resolveAccountKey(raw || 'personal');
}

router.get('/profile', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);

  try {
    const profile = await getUserProfile(accountKey);
    res.json({
      success: true,
      accountKey,
      profile,
    });
  } catch (error) {
    console.error('[User] GET /profile failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load user profile.',
    });
  }
});

router.put('/profile', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const updates = req.body?.profile ?? req.body;

  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'Missing profile payload.' });
    return;
  }

  try {
    const profile = await upsertUserProfile(accountKey, updates);
    res.json({
      success: true,
      accountKey,
      profile,
    });
  } catch (error) {
    console.error('[User] PUT /profile failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to save user profile.',
    });
  }
});

router.get('/profile/knowledge', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);

  try {
    const knowledge = await getStructuredProfileKnowledge(accountKey);
    res.json({
      success: true,
      accountKey,
      ...knowledge,
    });
  } catch (error) {
    console.error('[User] GET /profile/knowledge failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load profile knowledge.',
    });
  }
});

router.get('/ai-usage', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);

  try {
    const usage = await getUsageSummary(accountKey);
    res.json({ success: true, accountKey, usage });
  } catch (error) {
    console.error('[User] GET /ai-usage failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load AI usage.',
    });
  }
});

router.get('/engagement', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);

  try {
    const engagement = await getDailyEngagement(accountKey);
    res.json({ success: true, accountKey, engagement });
  } catch (error) {
    console.error('[User] GET /engagement failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load daily engagement.',
    });
  }
});

router.post('/engagement/clear', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const count = Number(req.body?.count ?? 1);

  try {
    const engagement = await recordClearance(accountKey, count);
    res.json({ success: true, accountKey, engagement });
  } catch (error) {
    console.error('[User] POST /engagement/clear failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to record clearance.',
    });
  }
});

router.get('/stats', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const characterId = getCharacterIdFromRequest(req);

  try {
    const stats = await getPlayerStats(accountKey, characterId);
    res.json({
      success: true,
      accountKey,
      characterId,
      stats,
    });
  } catch (error) {
    console.error('[User] GET /stats failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load player stats.',
    });
  }
});

router.post('/stats/deletion', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const characterId = getCharacterIdFromRequest(req);
  const count = Number(req.body?.count ?? 1);

  try {
    const stats = await recordDeletions(accountKey, count, characterId);
    res.json({
      success: true,
      accountKey,
      characterId,
      stats,
    });
  } catch (error) {
    console.error('[User] POST /stats/deletion failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to record deletion.',
    });
  }
});

module.exports = router;
