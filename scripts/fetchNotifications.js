#!/usr/bin/env node
/**
 * Fetches unread emails via IMAP into per-account notification feeds.
 *
 * Usage:
 *   node scripts/fetchNotifications.js
 *   node scripts/fetchNotifications.js --account=work
 */

require('dotenv').config();

const fs = require('fs');
const { simpleParser } = require('mailparser');
const { getAccount, resolveAccountKey } = require('../backend/accounts');
const { readNotifications, writeNotifications } = require('../backend/notificationFeed');
const { openInbox } = require('../backend/imapAuth');
const { getImapConfigForAccount } = require('../backend/imapAuth');
const { enrichNotifications } = require('../backend/notificationEnrichment');
const { extractMailparserAttachments } = require('../backend/emailAttachments');
const { analyzeEmail } = require('../backend/services/aiClassifier');
const { sendPushNotification } = require('../backend/services/pushNotificationService');
const { upsertLog, updateLogByMessageId } = require('../backend/automationLogsService');

const MAX_UNREAD = 15;

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatSender(address) {
  if (!address) return 'Unknown';
  if (Array.isArray(address)) {
    return address.map(formatSender).join(', ');
  }
  if (address.name && address.address) {
    return `${address.name} <${address.address}>`;
  }
  return address.address || address.text || 'Unknown';
}

function extractBody(parsed) {
  if (parsed.text && parsed.text.trim()) {
    return parsed.text.trim();
  }
  if (parsed.html) {
    return stripHtml(parsed.html);
  }
  return '';
}

function buildRawText(subject, body) {
  const subjectLine = subject ? `Subject: ${subject}` : 'Subject: (no subject)';
  const cleanBody = body || '(empty body)';
  return `${subjectLine}\n\n${cleanBody}`;
}

function parseSubjectFromRawText(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match?.[1]?.trim() || '(no subject)';
}

function parseBodyFromRawText(rawText) {
  const parts = String(rawText || '').split(/\n\n/);
  if (parts.length <= 1) {
    return '';
  }
  return parts.slice(1).join('\n\n').trim();
}

async function classifyAndLogEmail(notification, accountKey) {
  const subject = parseSubjectFromRawText(notification.rawText);
  const body = parseBodyFromRawText(notification.rawText);

  console.log(`[Processing] Analyzing incoming email ID: ${notification.id}`);

  const aiAnalysis = await analyzeEmail(notification.sender, subject, body);

  if (String(aiAnalysis.priority || '').toLowerCase() === 'high') {
    try {
      await sendPushNotification(
        `🚨 High Priority: ${notification.sender}`,
        aiAnalysis.summary,
        {
          logId: notification.id,
          screen: 'admin_logs',
          accountKey,
          category: aiAnalysis.category,
        },
      );
    } catch (error) {
      console.error(
        `[Processing] High-priority push failed for ${notification.id}:`,
        error,
      );
    }
  }

  const logPayload = {
    notificationId: notification.id,
    sender: notification.sender,
    subject,
    sourceApp: notification.sourceApp,
    timestamp: notification.timestamp,
    aiSummary: aiAnalysis.summary,
    category: aiAnalysis.category,
    priority: aiAnalysis.priority,
    ...(aiAnalysis.ai_error ? { ai_error: aiAnalysis.ai_error } : {}),
  };

  try {
    await upsertLog({
      messageId: notification.id,
      accountKey,
      eventType: 'inbound_email',
      status: 'processing',
      payload: logPayload,
    });

    await updateLogByMessageId(notification.id, {
      status: 'completed',
      resultPayload: aiAnalysis,
      errorMessage: aiAnalysis.ai_error ?? null,
    });
  } catch (error) {
    console.error(
      `[Processing] Failed to save automation log for ${notification.id}:`,
      error,
    );
  }

  return {
    ...notification,
    aiSummary: aiAnalysis.summary,
    aiCategory: aiAnalysis.category,
    aiPriority: aiAnalysis.priority,
  };
}

async function applyAiClassificationToNotifications(notifications, accountKey) {
  const classified = [];
  for (const notification of notifications) {
    classified.push(await classifyAndLogEmail(notification, accountKey));
  }
  return classified;
}

function openInboxFromConfig(config) {
  return openInbox(config, true);
}

function searchUnread(imap) {
  return new Promise((resolve, reject) => {
    imap.search(['UNSEEN'], (err, results) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(results || []);
    });
  });
}

function fetchMessages(imap, uids) {
  return new Promise((resolve, reject) => {
    if (uids.length === 0) {
      resolve([]);
      return;
    }

    const messages = [];
    const fetch = imap.fetch(uids, { bodies: '', markSeen: false });

    fetch.on('message', (msg) => {
      let buffer = '';
      let uid = null;
      let gmailMsgId = null;

      msg.on('attributes', (attrs) => {
        uid = attrs.uid;
        gmailMsgId = attrs['x-gm-msgid'] ? String(attrs['x-gm-msgid']) : null;
      });

      msg.on('body', (stream) => {
        stream.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
        });
      });

      msg.once('end', () => {
        messages.push({ uid, buffer, gmailMsgId });
      });
    });

    fetch.once('error', reject);
    fetch.once('end', () => resolve(messages));
  });
}

async function parseMessage(buffer, uid, meta = {}) {
  const parsed = await simpleParser(buffer);
  const subject = parsed.subject || '';
  const sender = formatSender(parsed.from);
  const body = extractBody(parsed);
  const timestamp = (parsed.date || new Date()).toISOString();
  const mailparserAttachments = extractMailparserAttachments(parsed);

  return {
    notification: {
      id: `email-${uid}`,
      sourceApp: 'Email',
      sender,
      rawText: buildRawText(subject, body),
      timestamp,
      messageIdHeader: parsed.messageId || null,
      gmailMessageId: meta.gmailMsgId || null,
    },
    mailparserAttachments,
  };
}

/**
 * @param {{ accountKey?: string, silent?: boolean }} options
 */
async function fetchNotifications(options = {}) {
  const accountKey = resolveAccountKey(options.accountKey || 'personal');
  const { silent = false } = options;
  const account = getAccount(accountKey);

  if (!account) {
    throw new Error(`Unknown account key: ${accountKey}`);
  }

  if (account.mockOnly) {
    const existing = await readNotifications(accountKey);
    if (!silent) {
      console.log(
        `[${accountKey}] Mock account — keeping ${existing.length} seeded notification(s).`,
      );
    }
    return {
      accountKey,
      unreadTotal: existing.length,
      fetchedCount: 0,
      newCount: 0,
      writtenCount: existing.length,
      mockOnly: true,
    };
  }

  if (account.oauth) {
    const imapConfig = await getImapConfigForAccount(accountKey);
    const previousIds = new Set((await readNotifications(accountKey)).map((item) => item.id));

    if (!silent) {
      console.log(`[${accountKey}] Connecting via Google OAuth as ${imapConfig.user}...`);
    }

    const imap = await openInboxFromConfig(imapConfig);
    const unreadUids = await searchUnread(imap);
    const selectedUids = unreadUids.slice(-MAX_UNREAD).reverse();

    if (!silent) {
      console.log(
        `[${accountKey}] Found ${unreadUids.length} unread — fetching ${selectedUids.length}...`,
      );
    }

    const rawMessages = await fetchMessages(imap, selectedUids);
    imap.end();

    const notifications = [];
    const pendingAttachments = new Map();
    for (const message of rawMessages) {
      const { notification, mailparserAttachments } = await parseMessage(
        message.buffer,
        message.uid,
        { gmailMsgId: message.gmailMsgId },
      );
      if (mailparserAttachments.length > 0) {
        pendingAttachments.set(notification.id, mailparserAttachments);
      }
      notifications.push(notification);
    }

    notifications.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const aiClassified = await applyAiClassificationToNotifications(
      notifications,
      accountKey,
    );

    const existing = await readNotifications(accountKey);
    const enriched = await enrichNotifications(accountKey, aiClassified, existing, {
      pendingAttachments,
    });
    const newCount = enriched.filter((item) => !previousIds.has(item.id)).length;
    await writeNotifications(accountKey, enriched);

    if (!silent) {
      console.log(
        `[${accountKey}] Wrote ${enriched.length} notification(s) to ${account.feedFile}`,
      );
    }

    return {
      accountKey,
      unreadTotal: unreadUids.length,
      fetchedCount: selectedUids.length,
      newCount,
      writtenCount: enriched.length,
      mockOnly: false,
      oauth: true,
    };
  }

  const { user, password, host, port } = account.imap;
  if (!user || !password) {
    throw new Error(`IMAP credentials missing for account "${accountKey}".`);
  }

  const previousIds = new Set((await readNotifications(accountKey)).map((item) => item.id));

  if (!silent) {
    console.log(`[${accountKey}] Connecting to ${host}:${port} as ${user}...`);
  }

  const imap = await openInboxFromConfig({ user, password, host, port });
  const unreadUids = await searchUnread(imap);
  const selectedUids = unreadUids.slice(-MAX_UNREAD).reverse();

  if (!silent) {
    console.log(
      `[${accountKey}] Found ${unreadUids.length} unread — fetching ${selectedUids.length}...`,
    );
  }

  const rawMessages = await fetchMessages(imap, selectedUids);
  imap.end();

  const notifications = [];
  const pendingAttachments = new Map();
  for (const message of rawMessages) {
    const { notification, mailparserAttachments } = await parseMessage(
      message.buffer,
      message.uid,
      { gmailMsgId: message.gmailMsgId },
    );
    if (mailparserAttachments.length > 0) {
      pendingAttachments.set(notification.id, mailparserAttachments);
    }
    notifications.push(notification);
  }

  notifications.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const aiClassified = await applyAiClassificationToNotifications(
    notifications,
    accountKey,
  );

  const existing = await readNotifications(accountKey);
  const enriched = await enrichNotifications(accountKey, aiClassified, existing, {
    pendingAttachments,
  });
  const newCount = enriched.filter((item) => !previousIds.has(item.id)).length;
  await writeNotifications(accountKey, enriched);

  if (!silent) {
    console.log(
      `[${accountKey}] Wrote ${enriched.length} notification(s) to ${account.feedFile}`,
    );
  }

  return {
    accountKey,
    unreadTotal: unreadUids.length,
    fetchedCount: selectedUids.length,
    newCount,
    writtenCount: enriched.length,
    mockOnly: false,
  };
}

module.exports = { fetchNotifications };

if (require.main === module) {
  const argAccount = process.argv.find((arg) => arg.startsWith('--account='));
  const accountKey = argAccount ? argAccount.split('=')[1] : 'personal';

  fetchNotifications({ accountKey })
    .then((stats) => {
      console.log(
        `Done [${stats.accountKey}] — ${stats.unreadTotal} unread, ${stats.newCount} new, ${stats.writtenCount} written.`,
      );
    })
    .catch((error) => {
      console.error('Failed to fetch notifications:', error);
      process.exit(1);
    });
}
