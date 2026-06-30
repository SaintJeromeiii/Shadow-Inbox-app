const express = require('express');
const { loadKnowledgeBase } = require('../knowledgeBase');
const { resolveAccountKey, resolveFinanceAccountKeys } = require('../accounts');
const { readNotifications, removeNotificationIds } = require('../notificationFeed');
const { generateQuickReplies } = require('../quickReplyService');
const { sendBroadcastReplyWithRetry } = require('../relayRetryService');
const { recordDeletions } = require('../userProgressService');
const { getCharacterIdFromRequest } = require('../characterIds');

const router = express.Router();
const knowledgeBase = loadKnowledgeBase();

function getAccountKeyFromRequest(req) {
  const raw = req.headers['x-account-key'] || req.query?.accountKey || req.body?.accountKey;
  return resolveAccountKey(raw || 'personal');
}

async function findNotificationById(accountKey, messageId) {
  const accountKeys = await resolveFinanceAccountKeys(accountKey);

  for (const key of accountKeys) {
    const notifications = await readNotifications(key);
    const match = notifications.find((item) => item.id === messageId);
    if (match) {
      return { notification: match, accountKey: key };
    }
  }

  return null;
}

function buildContextFromNotification(notification) {
  return [
    `From: ${notification.sender}`,
    `Source: ${notification.sourceApp}`,
    notification.triage?.cleanSummary
      ? `Summary: ${notification.triage.cleanSummary}`
      : null,
    notification.rawText,
  ]
    .filter(Boolean)
    .join('\n\n');
}

router.post('/generate', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const messageId = req.body?.messageId || req.body?.notificationId;
  const contextInput = req.body?.context;

  try {
    let context = String(contextInput || '').trim();
    let resolvedMessageId = null;

    if (messageId) {
      const found = await findNotificationById(accountKey, messageId);
      if (!found) {
        res.status(404).json({ error: `Message not found: ${messageId}` });
        return;
      }

      context = buildContextFromNotification(found.notification);
      resolvedMessageId = found.notification.id;
    }

    if (!context) {
      res.status(400).json({
        error: 'Provide messageId or context to generate quick replies.',
      });
      return;
    }

    const result = await generateQuickReplies({
      context,
      knowledgeBase,
    });

    res.json({
      success: true,
      accountKey,
      messageId: resolvedMessageId,
      options: {
        acknowledge: result.option1,
        moreInfo: result.option2,
        defer: result.option3,
      },
      option1: result.option1,
      option2: result.option2,
      option3: result.option3,
      mode: result.mode,
      warning: result.warning,
    });
  } catch (error) {
    console.error('[Replies] POST /generate failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate quick replies.',
    });
  }
});

router.post('/send', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const messageId = req.body?.messageId || req.body?.notificationId;
  const replyText = req.body?.replyText || req.body?.body;

  if (!messageId || typeof messageId !== 'string') {
    res.status(400).json({ error: 'Missing "messageId".' });
    return;
  }

  if (!replyText || typeof replyText !== 'string' || !replyText.trim()) {
    res.status(400).json({ error: 'Missing or invalid "replyText".' });
    return;
  }

  try {
    const found = await findNotificationById(accountKey, messageId);
    if (!found) {
      res.status(404).json({ error: `Message not found: ${messageId}` });
      return;
    }

    const result = await sendBroadcastReplyWithRetry(
      found.accountKey,
      found.notification,
      replyText,
    );

    await removeNotificationIds(found.accountKey, [messageId]);

    let playerStats = null;
    const characterId = getCharacterIdFromRequest(req);
    try {
      playerStats = await recordDeletions(found.accountKey, 1, characterId);
    } catch (progressError) {
      console.warn('[Replies] Player progress update failed:', progressError);
    }

    console.log(
      `[Replies] Sent ${result.platform} reply for ${messageId} (${found.accountKey}).`,
    );

    res.json({
      success: true,
      accountKey: found.accountKey,
      messageId,
      playerStats,
      ...result,
    });
  } catch (error) {
    console.error('[Replies] POST /send failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send reply.',
    });
  }
});

module.exports = router;
