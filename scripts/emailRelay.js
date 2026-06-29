#!/usr/bin/env node
/**
 * Local SMTP relay for Shadow Inbox.
 * Listens on port 3000 and sends replies via nodemailer.
 *
 * Required env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *
 * Usage:
 *   npm run email-relay
 */

require('dotenv').config();

const os = require('os');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { loadKnowledgeBase } = require('../backend/knowledgeBase');
const { archiveMessages, trashMessages } = require('../backend/gmailClient');
const { readNotifications, removeNotificationIds } = require('../backend/notificationFeed');
const { getAccount, listAccounts, resolveAccountKey } = require('../backend/accounts');
const { fetchNotifications } = require('./fetchNotifications');
const { completeGoogleOAuth, getValidAccessToken } = require('../backend/googleOAuth');
const { toPublicProfile, getOAuthAccount, removeOAuthAccount } = require('../backend/userTokens');
const { ensureShadowLabelSet } = require('../backend/shadowLabels');
const { applyShadowLabelsToNotification } = require('../backend/shadowLabels');
const { writeNotifications } = require('../backend/notificationFeed');
const { redraftReply } = require('../backend/redraftService');
const {
  registerDevicePushToken,
  removeDevicePushToken,
  listDevicePushTokens,
} = require('../backend/devicePushTokens');
const { listTasks, toggleTaskComplete } = require('../backend/taskService');
const knowledgeRouter = require('../backend/routes/knowledge');
const calendarRouter = require('../backend/routes/calendar');
const emailsRouter = require('../backend/routes/emails');
const broadcastRouter = require('../backend/routes/broadcast');
const autoPilotRouter = require('../backend/routes/autoPilot');
const financesRouter = require('../backend/routes/finances');
const notificationsRouter = require('../backend/routes/notifications');
const voiceRouter = require('../backend/routes/voice');
const briefingRouter = require('../backend/routes/briefing');
const timelineRouter = require('../backend/routes/timeline');
const firewallRouter = require('../backend/routes/firewall');
const repliesRouter = require('../backend/routes/replies');
const userRouter = require('../backend/routes/user');
const { recordDeletions, getPlayerStats } = require('../backend/userProgressService');
const { getCharacterIdFromRequest } = require('../backend/characterIds');
const { handleSlackWebhook } = require('../backend/slackWebhook');

const knowledgeBase = loadKnowledgeBase();
console.log(
  `[Relay] Smart Memory loaded (${knowledgeBase.length} chars from backend/knowledgebase.txt)`,
);

function requireEnv(name, value, { fatal = true } = {}) {
  if (!value) {
    const message = `Missing required environment variable: ${name}`;
    if (fatal) {
      console.error(message);
      process.exit(1);
    }
    console.warn(`[Relay] ${message}`);
    return false;
  }
  return true;
}

function isCloudRuntime() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RENDER ||
      process.env.FLY_APP_NAME ||
      (process.env.PORT && !process.env.EMAIL_RELAY_PORT),
  );
}

const personalAccount = getAccount('personal');
const cloudRuntime = isCloudRuntime();
requireEnv('SMTP_HOST', personalAccount?.smtp.host, { fatal: !cloudRuntime });
requireEnv('SMTP_USER', personalAccount?.smtp.user, { fatal: !cloudRuntime });
requireEnv('SMTP_PASS', personalAccount?.smtp.pass, { fatal: !cloudRuntime });

if (cloudRuntime) {
  console.log('[Relay] Cloud runtime detected — OAuth Gmail linking enabled.');
}

function getAccountKeyFromRequest(req) {
  const header = req.headers['x-account-key'];
  const query = req.query?.accountKey;
  const bodyKey = req.body?.accountKey;
  return resolveAccountKey(header || query || bodyKey || 'personal');
}

async function createTransporter(accountKey) {
  const account = getAccount(resolveAccountKey(accountKey));
  if (!account) {
    throw new Error(`Unknown account key: ${accountKey}`);
  }

  if (account.oauth) {
    const oauthRecord = getOAuthAccount(account.key);
    const accessToken = await getValidAccessToken(account.key);

    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: account.email,
        clientId: process.env.GOOGLE_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: oauthRecord?.refreshToken,
        accessToken,
      },
    });
  }

  const { user, pass, host, port } = account.smtp;
  if (!user || !pass) {
    throw new Error(`SMTP credentials are not configured for account "${account.key}".`);
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const app = express();
app.use(cors());
app.post(
  '/api/broadcast/webhooks/slack',
  express.raw({ type: 'application/json' }),
  handleSlackWebhook,
);
app.use(express.json({ limit: '1mb' }));
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/broadcast', broadcastRouter);
app.use('/api/auto-pilot', autoPilotRouter);
app.use('/api/finances', financesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/briefing', briefingRouter);
app.use('/api/timeline', timelineRouter);
app.use('/api/firewall', firewallRouter);
app.use('/api/replies', repliesRouter);
app.use('/api/user', userRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'shadow-inbox-email-relay' });
});

app.get('/api/accounts', (_req, res) => {
  res.json({ accounts: listAccounts() });
});

app.post('/api/devices/register', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const { pushToken, platform, deviceName } = req.body ?? {};

  try {
    const registeredDevices = await registerDevicePushToken(pushToken, {
      accountKey,
      platform,
      deviceName,
    });

    console.log(
      `[Relay] Registered push device (${platform || 'unknown'}) — ${registeredDevices} total.`,
    );

    res.json({ success: true, registeredDevices, accountKey });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to register device.',
    });
  }
});

app.post('/api/devices/unregister', async (req, res) => {
  const { pushToken } = req.body ?? {};

  try {
    const removed = await removeDevicePushToken(pushToken);
    const registeredDevices = (await listDevicePushTokens()).length;

    res.json({ success: true, removed, registeredDevices });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to unregister device.',
    });
  }
});

app.get('/api/tasks', (req, res) => {
  const accountKey = req.query?.accountKey
    ? resolveAccountKey(String(req.query.accountKey))
    : null;
  const includeCompleted = String(req.query?.includeCompleted || 'false') === 'true';

  const tasks = listTasks({
    accountKey: accountKey || undefined,
    includeCompleted,
  });

  res.json({ success: true, tasks });
});

app.post('/api/tasks/:id/toggle', async (req, res) => {
  const taskId = req.params.id;
  const archiveSource = req.body?.archiveSource !== false;

  if (!taskId) {
    res.status(400).json({ error: 'Missing task id.' });
    return;
  }

  try {
    const result = await toggleTaskComplete(taskId, { archiveSource });
    res.json({
      success: true,
      task: result.task,
      archived: result.archived,
      archiveError: result.archiveError,
    });
  } catch (error) {
    res.status(error.message?.includes('not found') ? 404 : 500).json({
      error: error instanceof Error ? error.message : 'Failed to toggle task.',
    });
  }
});

function handleRemoveAccountRequest(req, res) {
  const accountKey = resolveAccountKey(
    req.params?.accountKey || req.body?.accountKey,
  );

  if (!accountKey) {
    res.status(400).json({ error: 'Missing "accountKey".' });
    return;
  }

  if (!getOAuthAccount(accountKey)) {
    res.status(400).json({
      error: 'Only linked Google accounts can be removed. Personal and work inboxes stay configured via .env.',
    });
    return;
  }

  const removed = removeOAuthAccount(accountKey);
  if (!removed) {
    res.status(404).json({ error: `OAuth account not found: ${accountKey}` });
    return;
  }

  console.log(`[Relay] Removed Google account ${removed.email} (${accountKey})`);
  res.status(200).json({
    success: true,
    accountKey,
    email: removed.email,
    accounts: listAccounts(),
  });
}

app.delete('/api/accounts/:accountKey', handleRemoveAccountRequest);
app.post('/api/accounts/remove', handleRemoveAccountRequest);

app.post('/api/auth/google/callback', async (req, res) => {
  const { code, redirectUri, codeVerifier, clientId, clientType } = req.body ?? {};

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing authorization "code".' });
    return;
  }

  const resolvedClientType = clientType === 'web' ? 'web' : 'android';
  if (
    resolvedClientType === 'android' &&
    (!redirectUri || typeof redirectUri !== 'string')
  ) {
    res.status(400).json({ error: 'Missing native "redirectUri" from the OAuth request.' });
    return;
  }

  try {
    const saved = await completeGoogleOAuth({
      code,
      redirectUri: typeof redirectUri === 'string' ? redirectUri : undefined,
      codeVerifier,
      clientId,
      clientType: resolvedClientType,
    });
    const account = toPublicProfile(saved);

    try {
      await fetchNotifications({ accountKey: saved.accountKey, silent: true });
    } catch (fetchError) {
      console.warn(
        `[Relay] OAuth account linked but initial fetch failed for ${saved.accountKey}:`,
        fetchError,
      );
    }

    try {
      await ensureShadowLabelSet(saved.accountKey);
    } catch (labelError) {
      console.warn(
        `[Relay] Could not bootstrap Shadow labels for ${saved.accountKey}:`,
        labelError,
      );
    }

    console.log(`[Relay] Linked Google account ${saved.email} as ${saved.accountKey}`);
    res.status(200).json({
      success: true,
      account,
      accountKey: saved.accountKey,
    });
  } catch (error) {
    console.error('[Relay] Google OAuth callback failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Google OAuth callback failed.',
    });
  }
});

app.get('/api/emails', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const shouldSync = req.query.sync === 'true' || req.query.sync === '1';

  try {
    if (shouldSync) {
      await fetchNotifications({ accountKey, silent: true });
    }

    const notifications = await readNotifications(accountKey);
    const account = getAccount(accountKey);

    res.status(200).json({
      accountKey,
      label: account.label,
      email: account.email,
      notifications,
      synced: shouldSync,
    });
  } catch (error) {
    console.error(`[Relay] GET /api/emails failed for ${accountKey}:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load inbox.',
    });
  }
});

app.post('/api/emails/sync-labels', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const items = Array.isArray(req.body?.notifications) ? req.body.notifications : [];

  if (items.length === 0) {
    res.status(400).json({ error: 'Provide a non-empty "notifications" array.' });
    return;
  }

  try {
    const current = await readNotifications(accountKey);
    const byId = new Map(current.map((item) => [item.id, item]));
    const updated = [];

    for (const item of items) {
      const existing = byId.get(item.id);
      if (!existing) continue;

      const labeled = await applyShadowLabelsToNotification(
        accountKey,
        { ...existing, ...item },
        item.triage,
      );
      byId.set(item.id, labeled);
      updated.push(labeled);
    }

    await writeNotifications(accountKey, Array.from(byId.values()));

    res.status(200).json({
      success: true,
      accountKey,
      updatedCount: updated.length,
      notifications: updated,
    });
  } catch (error) {
    console.error(`[Relay] sync-labels failed for ${accountKey}:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to sync Gmail labels.',
    });
  }
});

app.post('/api/emails/redraft', async (req, res) => {
  const {
    emailId,
    id,
    originalMessage,
    originalText,
    currentDraft,
    tone,
  } = req.body ?? {};

  const resolvedId = emailId || id;
  const resolvedMessage = originalMessage || originalText;

  if (!resolvedId || typeof resolvedId !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "emailId" field.' });
    return;
  }

  if (!tone || typeof tone !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "tone" field.' });
    return;
  }

  const normalizedTone = tone.toLowerCase();
  if (normalizedTone !== 'quick_template' && (!currentDraft || typeof currentDraft !== 'string')) {
    res.status(400).json({ error: 'Missing or invalid "currentDraft" field.' });
    return;
  }

  try {
    const accountKey = getAccountKeyFromRequest(req);
    const result = await redraftReply({
      accountKey,
      emailId: resolvedId,
      originalMessage: typeof resolvedMessage === 'string' ? resolvedMessage : '',
      currentDraft: typeof currentDraft === 'string' ? currentDraft : '',
      tone: normalizedTone,
    });

    res.json({
      success: true,
      draft: result.draft,
      tone: result.tone,
      mode: result.mode,
      warning: result.warning,
      memoryContext: result.memoryContext,
    });
  } catch (error) {
    console.error('[Relay] redraft failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to redraft reply.',
    });
  }
});

async function notificationsForIds(accountKey, ids) {
  const idSet = new Set(ids);
  const notifications = await readNotifications(accountKey);
  return notifications.filter((item) => idSet.has(item.id));
}

app.post('/send-reply', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const { recipient, subject, replyText } = req.body ?? {};

  if (!recipient || typeof recipient !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "recipient" field.' });
    return;
  }

  if (!subject || typeof subject !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "subject" field.' });
    return;
  }

  if (!replyText || typeof replyText !== 'string' || !replyText.trim()) {
    res.status(400).json({ error: 'Missing or invalid "replyText" field.' });
    return;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(recipient.trim())) {
    res.status(400).json({ error: 'Recipient is not a valid email address.' });
    return;
  }

  try {
    const account = getAccount(accountKey);
    if (account?.oauth) {
      const { sendGmailMessage } = require('../backend/gmailApi');
      const result = await sendGmailMessage(accountKey, {
        to: recipient.trim(),
        subject: subject.trim(),
        body: replyText.trim(),
      });

      console.log(
        `[${accountKey}] Sent reply to ${recipient} via Gmail API (messageId: ${result.id})`,
      );
      res.status(200).json({
        success: true,
        messageId: result.id,
        accountKey,
        transport: 'gmail_api',
      });
      return;
    }

    const transporter = await createTransporter(accountKey);
    const info = await transporter.sendMail({
      from: account.smtp.user,
      to: recipient.trim(),
      subject: subject.trim(),
      text: replyText.trim(),
    });

    console.log(
      `[${accountKey}] Sent reply to ${recipient} (messageId: ${info.messageId})`,
    );
    res.status(200).json({ success: true, messageId: info.messageId, accountKey });
  } catch (error) {
    console.error(`[${accountKey}] SMTP send failed:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'SMTP send failed.',
    });
  }
});

function normalizeIds(body) {
  const { ids, emailIds, threadIds } = body ?? {};
  const collected = [];

  if (Array.isArray(ids)) collected.push(...ids);
  if (Array.isArray(emailIds)) collected.push(...emailIds);
  if (Array.isArray(threadIds)) {
    collected.push(...threadIds.map((id) => `thread-${id}`));
  }

  return [...new Set(collected.filter((id) => typeof id === 'string' && id.trim()))];
}

app.post('/api/emails/archive', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const ids = normalizeIds(req.body);

  if (ids.length === 0) {
    res.status(400).json({
      error: 'Provide a non-empty "ids" array of email IDs (e.g. ["email-23585"]).',
    });
    return;
  }

  try {
    const account = getAccount(accountKey);
    let gmailResult = { archived: 0, unsupported: ids };

    if (!account.mockOnly) {
      gmailResult = await archiveMessages(
        accountKey,
        ids,
        await notificationsForIds(accountKey, ids),
      );
    }

    const feedResult = await removeNotificationIds(accountKey, ids);
    const characterId = getCharacterIdFromRequest(req);

    let playerStats = null;
    try {
      if (feedResult.removedCount > 0) {
        playerStats = await recordDeletions(accountKey, feedResult.removedCount, characterId);
      } else {
        playerStats = await getPlayerStats(accountKey, characterId);
      }
    } catch (progressError) {
      console.warn(`[${accountKey}] Player progress update failed:`, progressError);
    }

    console.log(
      `[${accountKey}] Archived ${gmailResult.archived} message(s); pruned ${feedResult.removedCount} from feed.`,
    );

    res.status(200).json({
      success: true,
      accountKey,
      characterId,
      archived: gmailResult.archived,
      feedRemoved: feedResult.removedCount,
      unsupported: gmailResult.unsupported,
      remainingInFeed: feedResult.remainingCount,
      playerStats,
    });
  } catch (error) {
    console.error(`[${accountKey}] Gmail archive failed:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Gmail archive failed.',
    });
  }
});

app.post('/api/emails/trash', async (req, res) => {
  const accountKey = getAccountKeyFromRequest(req);
  const ids = normalizeIds(req.body);

  if (ids.length === 0) {
    res.status(400).json({
      error: 'Provide a non-empty "ids" array of email IDs (e.g. ["email-23585"]).',
    });
    return;
  }

  try {
    const account = getAccount(accountKey);
    let gmailResult = { trashed: 0, unsupported: ids };

    if (!account.mockOnly) {
      gmailResult = await trashMessages(
        accountKey,
        ids,
        await notificationsForIds(accountKey, ids),
      );
    }

    const feedResult = await removeNotificationIds(accountKey, ids);
    const characterId = getCharacterIdFromRequest(req);

    let playerStats = null;
    try {
      if (feedResult.removedCount > 0) {
        playerStats = await recordDeletions(accountKey, feedResult.removedCount, characterId);
      } else {
        playerStats = await getPlayerStats(accountKey, characterId);
      }
    } catch (progressError) {
      console.warn(`[${accountKey}] Player progress update failed:`, progressError);
    }

    console.log(
      `[${accountKey}] Trashed ${gmailResult.trashed} message(s); pruned ${feedResult.removedCount} from feed.`,
    );

    res.status(200).json({
      success: true,
      accountKey,
      characterId,
      trashed: gmailResult.trashed,
      feedRemoved: feedResult.removedCount,
      unsupported: gmailResult.unsupported,
      remainingInFeed: feedResult.remainingCount,
      playerStats,
    });
  } catch (error) {
    console.error(`[${accountKey}] Gmail trash failed:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Gmail trash failed.',
    });
  }
});

function getLanAddress() {
  try {
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
      for (const entry of entries ?? []) {
        if (entry.family === 'IPv4' && !entry.internal) {
          return entry.address;
        }
      }
    }
  } catch (error) {
    console.warn(
      '[Relay] Could not read network interfaces:',
      error instanceof Error ? error.message : error,
    );
  }
  return null;
}

function startServer(options = {}) {
  const port = Number(options.port || process.env.PORT || process.env.EMAIL_RELAY_PORT || 3000);
  const host = options.host || process.env.EMAIL_RELAY_HOST || '0.0.0.0';

  const server = app.listen(port, host, () => {
    const lanIp = getLanAddress();
    const { isSupabaseEnabled } = require('../backend/supabaseClient');
    const storageMode = isSupabaseEnabled() ? 'Supabase' : 'local JSON files';
    console.log(`Shadow Inbox email relay listening on http://${host}:${port}`);
    console.log(`Storage: ${storageMode}`);
    if (cloudRuntime) {
      console.log(`Cloud:  https://shadow-inbox-production.up.railway.app (or your Railway URL)`);
    } else {
      console.log(`Local:  http://localhost:${port}`);
      if (lanIp) {
        console.log(`Phone:  http://${lanIp}:${port}  (set EXPO_PUBLIC_EMAIL_RELAY_URL to this)`);
      }
    }
    console.log(`Accounts: ${listAccounts().map((a) => a.key).join(', ')}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the other relay process and retry.`);
    } else {
      console.error('Email relay failed to start:', error);
    }
    process.exit(1);
  });

  return server;
}

module.exports = { app, startServer };

if (require.main === module) {
  startServer();
}
