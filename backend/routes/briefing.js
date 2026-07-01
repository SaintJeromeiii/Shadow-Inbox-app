const express = require('express');
const { loadKnowledgeBase } = require('../knowledgeBase');
const { resolveAccountKey } = require('../accounts');
const {
  generateExecutiveBrief,
  formatStoredBriefing,
} = require('../briefingService');
const { getLatestExecutiveBrief } = require('../executiveBriefsLedger');
const { consumeAiQuota, handleQuotaHttpError } = require('../aiUsageService');

const router = express.Router();
const knowledgeBase = loadKnowledgeBase();

function getAccountKeyFromRequest(req) {
  const raw = req.headers['x-account-key'] || req.query?.accountKey || req.body?.accountKey;
  if (!raw || String(raw).trim().toLowerCase() === 'all') {
    return 'all';
  }
  return resolveAccountKey(raw);
}

router.get('/latest', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);

  try {
    const stored = await getLatestExecutiveBrief(
      accountKey === 'all' ? null : accountKey,
    );

    if (!stored) {
      res.status(404).json({
        success: false,
        error: 'No executive brief has been generated yet.',
      });
      return;
    }

    res.json(formatStoredBriefing(stored));
  } catch (error) {
    console.error('[Briefing] GET /latest failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load latest briefing.',
    });
  }
});

async function handleGenerate(req, res) {
  const accountKey = getAccountKeyFromRequest(req);
  const triageByAccount = req.body?.triageByAccount ?? null;
  const quotaAccountKey =
    !accountKey || accountKey === 'all' ? 'personal' : accountKey;
  const scopedAccountKey =
    !accountKey || accountKey === 'all' || accountKey === 'personal'
      ? null
      : accountKey;

  try {
    await consumeAiQuota(quotaAccountKey, 'llm', 1);

    const briefing = await generateExecutiveBrief({
      accountKey: scopedAccountKey,
      triageByAccount,
      knowledgeBase,
    });

    console.log(
      `[Briefing] Generated executive brief (${briefing.mode}, ${briefing.urgencyLevel}) — ${briefing.stats.signalCount} signals.`,
    );

    res.status(200).json(briefing);
  } catch (error) {
    if (handleQuotaHttpError(res, error)) return;

    console.error('[Briefing] generate failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate briefing.',
    });
  }
}

router.get('/generate', handleGenerate);
router.post('/generate', handleGenerate);

// Legacy mobile clients hit POST /api/briefing directly.
router.get('/', handleGenerate);
router.post('/', handleGenerate);

module.exports = router;
