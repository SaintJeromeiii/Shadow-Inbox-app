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
const { completeGoogleOAuth } = require('../backend/googleOAuth');
const { toPublicProfile } = require('../backend/userTokens');
const { getValidAccessToken } = require('../backend/googleOAuth');
const { getOAuthAccount } = require('../backend/userTokens');

const knowledgeBase = loadKnowledgeBase();
console.log(
  `[Relay] Smart Memory loaded (${knowledgeBase.length} chars from backend/knowledgebase.txt)`,
);

const PORT = Number(process.env.EMAIL_RELAY_PORT || 3000);
const HOST = process.env.EMAIL_RELAY_HOST || '0.0.0.0';

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const personalAccount = getAccount('personal');
requireEnv('SMTP_HOST', personalAccount?.smtp.host);
requireEnv('SMTP_USER', personalAccount?.smtp.user);
requireEnv('SMTP_PASS', personalAccount?.smtp.pass);

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
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'shadow-inbox-email-relay' });
});

app.get('/api/accounts', (_req, res) => {
  res.json({ accounts: listAccounts() });
});

app.post('/api/auth/google/callback', async (req, res) => {
  const { code, redirectUri, codeVerifier, clientId, clientType } = req.body ?? {};

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing authorization "code".' });
    return;
  }

  if (!redirectUri || typeof redirectUri !== 'string') {
    res.status(400).json({ error: 'Missing native "redirectUri" from the OAuth request.' });
    return;
  }

  try {
    const saved = await completeGoogleOAuth({
      code,
      redirectUri,
      codeVerifier,
      clientId,
      clientType: clientType === 'web' ? 'web' : 'android',
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

    const notifications = readNotifications(accountKey);
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
    const transporter = await createTransporter(accountKey);
    const account = getAccount(accountKey);
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
      gmailResult = await archiveMessages(accountKey, ids);
    }

    const feedResult = removeNotificationIds(accountKey, ids);

    console.log(
      `[${accountKey}] Archived ${gmailResult.archived} message(s); pruned ${feedResult.removedCount} from feed.`,
    );

    res.status(200).json({
      success: true,
      accountKey,
      archived: gmailResult.archived,
      feedRemoved: feedResult.removedCount,
      unsupported: gmailResult.unsupported,
      remainingInFeed: feedResult.remainingCount,
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
      gmailResult = await trashMessages(accountKey, ids);
    }

    const feedResult = removeNotificationIds(accountKey, ids);

    console.log(
      `[${accountKey}] Trashed ${gmailResult.trashed} message(s); pruned ${feedResult.removedCount} from feed.`,
    );

    res.status(200).json({
      success: true,
      accountKey,
      trashed: gmailResult.trashed,
      feedRemoved: feedResult.removedCount,
      unsupported: gmailResult.unsupported,
      remainingInFeed: feedResult.remainingCount,
    });
  } catch (error) {
    console.error(`[${accountKey}] Gmail trash failed:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Gmail trash failed.',
    });
  }
});

function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return 'localhost';
}

const server = app.listen(PORT, HOST, () => {
  const lanIp = getLanAddress();
  console.log(`Shadow Inbox email relay listening on http://${HOST}:${PORT}`);
  console.log(`Local:  http://localhost:${PORT}`);
  console.log(`Phone:  http://${lanIp}:${PORT}  (set EXPO_PUBLIC_EMAIL_RELAY_URL to this)`);
  console.log(`Accounts: ${listAccounts().map((a) => a.key).join(', ')}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other relay process and retry.`);
  } else {
    console.error('Email relay failed to start:', error);
  }
  process.exit(1);
});
