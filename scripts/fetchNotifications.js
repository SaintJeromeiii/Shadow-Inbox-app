#!/usr/bin/env node
/**
 * Fetches unread emails into per-account notification feeds.
 * OAuth accounts sync via Gmail API (paginated); password accounts use IMAP.
 *
 * Usage:
 *   node scripts/fetchNotifications.js
 *   node scripts/fetchNotifications.js --account=work
 */

require('dotenv').config();

const { simpleParser } = require('mailparser');
const { getAccount, resolveAccountKey } = require('../backend/accounts');
const { readNotifications, writeNotifications } = require('../backend/notificationFeed');
const { openInbox } = require('../backend/imapAuth');
const { enrichNotifications } = require('../backend/notificationEnrichment');
const { extractMailparserAttachments } = require('../backend/emailAttachments');
const { analyzeEmail } = require('../backend/services/aiClassifier');
const { sendPushNotification } = require('../backend/services/pushNotificationService');
const { upsertLog, updateLogByMessageId } = require('../backend/automationLogsService');
const {
  listAllUnreadInboxMessageIds,
  getGmailMessageRaw,
  GMAIL_LIST_PAGE_SIZE,
} = require('../backend/gmailApi');

const IMAP_FETCH_PAGE_SIZE = Number(process.env.IMAP_FETCH_PAGE_SIZE) || GMAIL_LIST_PAGE_SIZE;
const FETCH_MAX_UNREAD =
  Number(process.env.FETCH_MAX_UNREAD) > 0 ? Number(process.env.FETCH_MAX_UNREAD) : null;
const FETCH_MAX_UNREAD_CAP =
  Number(process.env.FETCH_MAX_UNREAD_CAP) > 0 ? Number(process.env.FETCH_MAX_UNREAD_CAP) : 500;
const AI_BODY_MAX_CHARS = 1500;

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

/**
 * Strips HTML/CSS noise and caps length before GPT classification.
 */
function prepareEmailTextForAi(rawText) {
  let plain = String(rawText || '');

  if (/<[a-z][\s\S]*>/i.test(plain)) {
    plain = stripHtml(plain);
  }

  plain = plain
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{[^{}]*:[^{}]*;[^{}]*\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (plain.length > AI_BODY_MAX_CHARS) {
    plain = `${plain.slice(0, AI_BODY_MAX_CHARS).trim()}…`;
  }

  return plain;
}

async function classifyAndLogEmail(notification, accountKey) {
  const subject = parseSubjectFromRawText(notification.rawText);
  const body = prepareEmailTextForAi(parseBodyFromRawText(notification.rawText));

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

function selectUnreadUids(unreadUids) {
  const sorted = [...unreadUids].sort((a, b) => b - a);
  const limit = FETCH_MAX_UNREAD ?? FETCH_MAX_UNREAD_CAP;
  return sorted.slice(0, limit);
}

async function fetchMessagesInPages(imap, uids, pageSize = IMAP_FETCH_PAGE_SIZE) {
  const allMessages = [];

  for (let offset = 0; offset < uids.length; offset += pageSize) {
    const chunk = uids.slice(offset, offset + pageSize);
    const batch = await fetchMessages(imap, chunk);
    allMessages.push(...batch);
  }

  return allMessages;
}

async function fetchOAuthUnreadViaGmailApi(accountKey, { silent = false } = {}) {
  const unreadApiIds = await listAllUnreadInboxMessageIds(accountKey, {
    maxResults: GMAIL_LIST_PAGE_SIZE,
    hardCap: FETCH_MAX_UNREAD ?? FETCH_MAX_UNREAD_CAP,
  });

  if (!silent) {
    console.log(
      `[${accountKey}] Gmail API reports ${unreadApiIds.length} unread inbox message(s) — fetching bodies...`,
    );
  }

  const rawMessages = [];
  for (let offset = 0; offset < unreadApiIds.length; offset += GMAIL_LIST_PAGE_SIZE) {
    const pageIds = unreadApiIds.slice(offset, offset + GMAIL_LIST_PAGE_SIZE);

    for (const apiMessageId of pageIds) {
      try {
        const buffer = await getGmailMessageRaw(accountKey, apiMessageId);
        rawMessages.push({
          uid: apiMessageId,
          buffer: buffer.toString('utf8'),
          gmailMsgId: apiMessageId,
          gmailApiMessageId: apiMessageId,
          useGmailApiId: true,
        });
      } catch (error) {
        console.warn(
          `[${accountKey}] Failed to fetch Gmail message ${apiMessageId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return {
    unreadTotal: unreadApiIds.length,
    rawMessages,
  };
}

async function buildNotificationsFromRawMessages(rawMessages) {
  const notifications = [];
  const pendingAttachments = new Map();

  for (const message of rawMessages) {
    const notificationId = message.useGmailApiId
      ? `gmail-${message.uid}`
      : `email-${message.uid}`;

    const { notification, mailparserAttachments } = await parseMessage(
      message.buffer,
      message.uid,
      {
        gmailMsgId: message.gmailMsgId,
        notificationId,
        gmailApiMessageId: message.gmailApiMessageId || null,
      },
    );

    if (mailparserAttachments.length > 0) {
      pendingAttachments.set(notification.id, mailparserAttachments);
    }
    notifications.push(notification);
  }

  notifications.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return { notifications, pendingAttachments };
}

async function finalizeNotificationBatch(accountKey, notifications, pendingAttachments, silent) {
  const account = getAccount(resolveAccountKey(accountKey));
  const previousIds = new Set((await readNotifications(accountKey)).map((item) => item.id));

  const aiClassified = await applyAiClassificationToNotifications(notifications, accountKey);

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
    newCount,
    writtenCount: enriched.length,
  };
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
      id: meta.notificationId || `email-${uid}`,
      sourceApp: 'Email',
      sender,
      rawText: buildRawText(subject, body),
      timestamp,
      messageIdHeader: parsed.messageId || null,
      gmailMessageId: meta.gmailMsgId || null,
      gmailApiMessageId: meta.gmailApiMessageId || null,
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
    if (!silent) {
      console.log(`[${accountKey}] Syncing unread inbox via Gmail API + OAuth...`);
    }

    const { unreadTotal, rawMessages } = await fetchOAuthUnreadViaGmailApi(accountKey, {
      silent,
    });
    const { notifications, pendingAttachments } = await buildNotificationsFromRawMessages(
      rawMessages,
    );
    const result = await finalizeNotificationBatch(
      accountKey,
      notifications,
      pendingAttachments,
      silent,
    );

    return {
      ...result,
      unreadTotal,
      fetchedCount: rawMessages.length,
      mockOnly: false,
      oauth: true,
      syncMode: 'gmail_api',
    };
  }

  const { user, password, host, port } = account.imap;
  if (!user || !password) {
    throw new Error(`IMAP credentials missing for account "${accountKey}".`);
  }

  if (!silent) {
    console.log(`[${accountKey}] Connecting to ${host}:${port} as ${user}...`);
  }

  const imap = await openInboxFromConfig({ user, password, host, port });
  const unreadUids = await searchUnread(imap);
  const selectedUids = selectUnreadUids(unreadUids);

  if (!silent) {
    console.log(
      `[${accountKey}] Found ${unreadUids.length} unread — fetching ${selectedUids.length} in pages of ${IMAP_FETCH_PAGE_SIZE}...`,
    );
  }

  const rawMessages = await fetchMessagesInPages(imap, selectedUids);
  imap.end();

  const { notifications, pendingAttachments } = await buildNotificationsFromRawMessages(
    rawMessages,
  );
  const result = await finalizeNotificationBatch(
    accountKey,
    notifications,
    pendingAttachments,
    silent,
  );

  return {
    ...result,
    unreadTotal: unreadUids.length,
    fetchedCount: selectedUids.length,
    mockOnly: false,
    syncMode: 'imap',
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
