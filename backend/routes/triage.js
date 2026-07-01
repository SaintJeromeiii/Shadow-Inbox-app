const express = require('express');
const { resolveAccountKey } = require('../accounts');
const {
  getTriageMode,
  isLlmConfigured,
  triageNotification,
  triageNotifications,
  MAX_BATCH_SIZE,
} = require('../triageService');
const { getUsageSummary, handleQuotaHttpError } = require('../aiUsageService');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const raw = req.headers['x-account-key'] || req.query?.accountKey || req.body?.accountKey;
  return resolveAccountKey(raw || 'personal');
}

router.get('/status', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  let usage = null;

  try {
    const summary = await getUsageSummary(accountKey);
    usage = summary.triage;
  } catch {
    usage = null;
  }

  res.json({
    success: true,
    mode: getTriageMode(),
    configured: isLlmConfigured(),
    maxBatchSize: MAX_BATCH_SIZE,
    usage,
  });
});

router.post('/', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const notification = req.body?.notification;

  if (!notification || typeof notification !== 'object') {
    res.status(400).json({ error: 'Missing notification payload.' });
    return;
  }

  try {
    const outcome = await triageNotification(notification, accountKey);
    res.json({
      success: true,
      accountKey,
      mode: outcome.mode,
      triage: outcome.triage,
      error: outcome.error ?? null,
    });
  } catch (error) {
    if (handleQuotaHttpError(res, error)) return;

    console.error('[Triage] POST / failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Triage failed.',
    });
  }
});

router.post('/batch', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const notifications = req.body?.notifications;

  if (!Array.isArray(notifications) || notifications.length === 0) {
    res.status(400).json({ error: 'Missing notifications array.' });
    return;
  }

  if (notifications.length > MAX_BATCH_SIZE) {
    res.status(400).json({
      error: `Batch limit is ${MAX_BATCH_SIZE} notifications per request.`,
    });
    return;
  }

  try {
    const outcome = await triageNotifications(notifications, accountKey);
    res.json({
      success: true,
      accountKey,
      mode: outcome.mode,
      processed: outcome.processed,
      results: outcome.results,
      usage: outcome.usage ?? null,
      truncated: Boolean(outcome.truncated),
    });
  } catch (error) {
    if (handleQuotaHttpError(res, error)) return;

    console.error('[Triage] POST /batch failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Batch triage failed.',
    });
  }
});

module.exports = router;
