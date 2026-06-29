const express = require('express');
const { resolveAccountKey } = require('../accounts');
const { buildTimeline } = require('../timelineService');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const raw = req.headers['x-account-key'] || req.query?.accountKey;
  if (!raw || String(raw).trim().toLowerCase() === 'all') {
    return null;
  }
  return resolveAccountKey(raw);
}

router.get('/', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const scopedAccountKey =
    !accountKey || accountKey === 'personal' ? null : accountKey;

  try {
    const timeline = await buildTimeline({ accountKey: scopedAccountKey });

    if (timeline.blockCount === 0) {
      res.json({
        ...timeline,
        message: 'No signals logged for the current calendar day.',
      });
      return;
    }

    res.json(timeline);
  } catch (error) {
    console.error('[Timeline] GET / failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to build timeline.',
    });
  }
});

module.exports = router;
