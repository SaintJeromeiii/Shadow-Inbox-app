const express = require('express');
const { resolveAccountKey } = require('../accounts');
const { buildFinanceSummary } = require('../financeLedger');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const header = req.headers['x-account-key'];
  const query = req.query?.accountKey;
  return resolveAccountKey(header || query || 'personal');
}

router.get('/summary', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const monthKey = req.query?.monthKey ? String(req.query.monthKey) : undefined;
  const limit = Number(req.query?.limit || 25);

  try {
    const summary = await buildFinanceSummary({ accountKey, monthKey, limit });
    res.json({
      success: true,
      accountKey,
      ...summary,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to build finance summary.',
    });
  }
});

module.exports = router;
