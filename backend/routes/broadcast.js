const express = require('express');
const { resolveAccountKey } = require('../accounts');
const { removeNotificationIds } = require('../notificationFeed');
const { ingestPlatformMessages } = require('../chatIngestService');
const { ingestPlatformMessagesWithIdempotency } = require('../inboundWebhookGuard');
const { normalizeFromIngestPayload } = require('../platformIngest');
const {
  sendBroadcastReplyWithRetry,
} = require('../relayRetryService');
const { findNotificationById } = require('../broadcastReply');
const { pollDiscordChannels } = require('../discordPoll');

const router = express.Router();

function getAccountKeyFromRequest(req) {
  const header = req.headers['x-account-key'];
  const query = req.query?.accountKey;
  const bodyKey = req.body?.accountKey;
  return resolveAccountKey(header || query || bodyKey || 'personal');
}

router.post('/reply', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const notificationId = req.body?.notificationId;
  const replyText = req.body?.replyText;

  if (!notificationId || typeof notificationId !== 'string') {
    res.status(400).json({ error: 'Missing "notificationId".' });
    return;
  }

  if (!replyText || typeof replyText !== 'string' || !replyText.trim()) {
    res.status(400).json({ error: 'Missing or invalid "replyText".' });
    return;
  }

  const notification = await findNotificationById(accountKey, notificationId);
  if (!notification) {
    res.status(404).json({ error: `Notification not found: ${notificationId}` });
    return;
  }

  try {
    const result = await sendBroadcastReplyWithRetry(accountKey, notification, replyText);
    await removeNotificationIds(accountKey, [notificationId]);

    console.log(
      `[Broadcast] Sent ${result.platform} reply for ${notificationId} (${accountKey}).`,
    );

    res.json({
      success: true,
      accountKey,
      notificationId,
      ...result,
    });
  } catch (error) {
    console.error(`[Broadcast] Reply failed for ${notificationId}:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Broadcast reply failed.',
    });
  }
});

router.post('/ingest', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const payloads = Array.isArray(req.body?.messages)
    ? req.body.messages
    : req.body?.message
      ? [req.body.message]
      : [req.body];

  const normalized = payloads
    .map((payload) => normalizeFromIngestPayload(payload))
    .filter(Boolean);

  if (normalized.length === 0) {
    res.status(400).json({ error: 'No valid Slack/Discord messages in payload.' });
    return;
  }

  try {
    const result = await ingestPlatformMessagesWithIdempotency(
      accountKey,
      normalized,
      ingestPlatformMessages,
    );
    res.json({ success: true, accountKey, ...result });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Platform ingest failed.',
    });
  }
});

router.post('/poll/discord', async (_req, res) => {
  try {
    const result = await pollDiscordChannels();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Discord poll failed.',
    });
  }
});

module.exports = router;
