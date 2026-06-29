const express = require('express');
const { resolveAccountKey } = require('../accounts');
const {
  listFirewallRules,
  createFirewallRule,
  deleteFirewallRule,
} = require('../firewallRulesService');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const raw = req.headers['x-account-key'] || req.query?.accountKey || req.body?.accountKey;
  return resolveAccountKey(raw || 'personal');
}

router.get('/rules', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const activeOnly = String(req.query?.activeOnly || 'false') === 'true';

  try {
    const rules = await listFirewallRules(accountKey, { activeOnly });
    res.json({
      success: true,
      accountKey,
      rules,
      activeCount: rules.filter((rule) => rule.isActive).length,
    });
  } catch (error) {
    console.error('[Firewall] GET /rules failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load firewall rules.',
    });
  }
});

router.post('/rules', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);

  try {
    const rule = await createFirewallRule(accountKey, {
      ruleType: req.body?.ruleType || req.body?.rule_type,
      matchValue: req.body?.matchValue || req.body?.match_value,
      actionEffect: req.body?.actionEffect || req.body?.action_effect,
      isActive: req.body?.isActive ?? req.body?.is_active,
    });

    res.status(201).json({
      success: true,
      rule,
    });
  } catch (error) {
    console.error('[Firewall] POST /rules failed:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to create firewall rule.',
    });
  }
});

router.delete('/rules/:id', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const ruleId = req.params.id;

  try {
    const deleted = await deleteFirewallRule(accountKey, ruleId);
    if (!deleted) {
      res.status(404).json({ error: `Rule not found: ${ruleId}` });
      return;
    }

    res.json({ success: true, id: ruleId });
  } catch (error) {
    console.error('[Firewall] DELETE /rules failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete firewall rule.',
    });
  }
});

module.exports = router;
