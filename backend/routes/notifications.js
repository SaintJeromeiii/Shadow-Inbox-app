const express = require('express');
const { resolveAccountKey } = require('../accounts');
const {
  registerDevicePushToken,
  removeDevicePushToken,
  listDevicePushTokens,
} = require('../devicePushTokens');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const header = req.headers['x-account-key'];
  const query = req.query?.accountKey;
  const bodyKey = req.body?.accountKey;
  return resolveAccountKey(header || query || bodyKey || 'personal');
}

router.post('/register-token', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const pushToken = req.body?.pushToken || req.body?.token;
  const { platform, deviceName } = req.body ?? {};

  if (!pushToken || typeof pushToken !== 'string') {
    res.status(400).json({ error: 'Missing "pushToken" field.' });
    return;
  }

  try {
    const registeredDevices = await registerDevicePushToken(pushToken, {
      accountKey,
      platform,
      deviceName,
    });

    console.log(
      `[Notifications] Registered ${accountKey} device (${platform || 'unknown'}) — ${registeredDevices} total.`,
    );

    res.json({
      success: true,
      accountKey,
      registeredDevices,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to register push token.',
    });
  }
});

router.post('/unregister-token', async (req, res) => {
  const pushToken = req.body?.pushToken || req.body?.token;

  if (!pushToken || typeof pushToken !== 'string') {
    res.status(400).json({ error: 'Missing "pushToken" field.' });
    return;
  }

  try {
    const removed = await removeDevicePushToken(pushToken);
    res.json({
      success: true,
      removed,
      registeredDevices: (await listDevicePushTokens()).length,
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to unregister push token.',
    });
  }
});

module.exports = router;
