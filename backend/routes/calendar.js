const express = require('express');
const { resolveAccountKey } = require('../accounts');
const { checkAvailability } = require('../calendarService');

const router = express.Router();

router.post('/check-availability', async (req, res) => {
  const accountKey = resolveAccountKey(req.body?.accountKey || req.query?.accountKey);
  const { startDateTime, endDateTime } = req.body || {};

  if (!startDateTime || !endDateTime) {
    res.status(400).json({
      error: 'Missing required fields: startDateTime, endDateTime',
    });
    return;
  }

  try {
    const result = await checkAvailability(accountKey, startDateTime, endDateTime);
    res.json({
      success: true,
      accountKey,
      ...result,
    });
  } catch (error) {
    const status = error.status === 403 ? 403 : 500;
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Calendar availability check failed.',
    });
  }
});

module.exports = router;
