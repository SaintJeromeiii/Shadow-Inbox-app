const express = require('express');
const { resolveAccountKey } = require('../accounts');
const {
  listRules,
  setRuleEnabled,
  getRuleById,
} = require('../autoRulesService');
const { listHistory } = require('../autoPilotHistory');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const header = req.headers['x-account-key'];
  const query = req.query?.accountKey;
  const bodyKey = req.body?.accountKey;
  return resolveAccountKey(header || query || bodyKey || 'personal');
}

router.get('/rules', async (_req, res) => {
  try {
    const rules = await listRules({ includeDisabled: true });
    const activeCount = rules.filter((rule) => rule.enabled !== false).length;
    res.json({
      success: true,
      rules,
      activeCount,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load auto-pilot rules.',
    });
  }
});

router.post('/rules/:ruleId/toggle', async (req, res) => {
  const ruleId = req.params.ruleId;
  const enabled = req.body?.enabled;

  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'Missing boolean "enabled" field.' });
    return;
  }

  try {
    const rule = await setRuleEnabled(ruleId, enabled);
    if (!rule) {
      res.status(404).json({ error: `Rule not found: ${ruleId}` });
      return;
    }

    const allRules = await listRules({ includeDisabled: true });
    res.json({
      success: true,
      rule,
      activeCount: allRules.filter((item) => item.enabled !== false).length,
    });
  } catch (error) {
    res.status(error.message?.includes('not found') ? 404 : 500).json({
      error: error instanceof Error ? error.message : 'Failed to toggle rule.',
    });
  }
});

router.get('/history', (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const limit = Number(req.query?.limit || 40);

  try {
    const entries = listHistory({ accountKey, limit });
    res.json({
      success: true,
      accountKey,
      entries,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load automation history.',
    });
  }
});

router.get('/rules/:ruleId', async (req, res) => {
  const rule = await getRuleById(req.params.ruleId);
  if (!rule) {
    res.status(404).json({ error: 'Rule not found.' });
    return;
  }
  res.json({ success: true, rule });
});

module.exports = router;
