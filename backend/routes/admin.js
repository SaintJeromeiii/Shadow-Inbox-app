const express = require('express');
const { resolveAccountKey } = require('../accounts');
const { listAutomationLogs } = require('../automationLogsService');
const { replayAutomationLog } = require('../relayRetryService');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const header = req.headers['x-account-key'];
  const query = req.query?.accountKey;
  const bodyKey = req.body?.accountKey;
  return resolveAccountKey(header || query || bodyKey || 'personal');
}

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'admin',
    routes: ['GET /logs', 'POST /logs/:id/retry'],
  });
});

router.get('/logs', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const status = typeof req.query?.status === 'string' ? req.query.status.trim() : null;
  const limit = Number(req.query?.limit) || 50;

  try {
    const logs = await listAutomationLogs({
      accountKey: req.query?.allAccounts === 'true' ? null : accountKey,
      status: status || null,
      limit,
    });

    res.json({
      success: true,
      accountKey,
      status: status || 'all',
      count: logs.length,
      logs,
    });
  } catch (error) {
    console.error('[Admin] GET /logs failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load automation logs.',
    });
  }
});

router.post('/logs/:id/retry', async (req, res) => {
  const logId = req.params.id;
  const accountKey = getAccountKeyFromRequest(req);

  try {
    const result = await replayAutomationLog(logId, { accountKey });

    if (result.replayed) {
      return res.json({
        success: true,
        message: result.message || 'Automation log successfully re-processed.',
        ...result,
      });
    }

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(`[Admin] POST /logs/${logId}/retry failed:`, error);

    const statusCode = error?.statusCode === 404 ? 404 : error?.statusCode === 500 ? 500 : 400;

    return res.status(statusCode).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to replay automation log.',
      details: error instanceof Error ? error.message : undefined,
      log: error?.log ?? undefined,
    });
  }
});

module.exports = router;
