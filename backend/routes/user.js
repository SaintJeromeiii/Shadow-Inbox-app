const express = require('express');
const { resolveAccountKey } = require('../accounts');
const { getCharacterIdFromRequest } = require('../characterIds');
const { getPlayerStats, recordDeletions } = require('../userProgressService');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const raw = req.headers['x-account-key'] || req.query?.accountKey || req.body?.accountKey;
  return resolveAccountKey(raw || 'personal');
}

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
