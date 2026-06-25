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

      msg.on('attributes', (attrs) => {
        uid = attrs.uid;
      });

      msg.on('body', (stream) => {
        stream.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
        });
      });

      msg.once('end', () => {
        messages.push({ uid, buffer });
      });
    });

    fetch.once('error', reject);
    fetch.once('end', () => resolve(messages));
  });
}

async function parseMessage(buffer, uid) {
  const parsed = await simpleParser(buffer);
  const subject = parsed.subject || '';
  const sender = formatSender(parsed.from);
  const body = extractBody(parsed);
  const timestamp = (parsed.date || new Date()).toISOString();

  return {
    id: `email-${uid}`,
    sourceApp: 'Email',
    sender,
    rawText: buildRawText(subject, body),
    timestamp,
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
    const existing = readNotifications(accountKey);
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
    const previousIds = new Set(readNotifications(accountKey).map((item) => item.id));

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
    for (const message of rawMessages) {
      const notification = await parseMessage(message.buffer, message.uid);
      notifications.push(notification);
    }

    notifications.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const newCount = notifications.filter((item) => !previousIds.has(item.id)).length;
    writeNotifications(accountKey, notifications);

    if (!silent) {
      console.log(
        `[${accountKey}] Wrote ${notifications.length} notification(s) to ${account.feedFile}`,
      );
    }

    return {
      accountKey,
      unreadTotal: unreadUids.length,
      fetchedCount: selectedUids.length,
      newCount,
      writtenCount: notifications.length,
      mockOnly: false,
      oauth: true,
    };
  }

  const { user, password, host, port } = account.imap;
  if (!user || !password) {
    throw new Error(`IMAP credentials missing for account "${accountKey}".`);
  }

  const previousIds = new Set(readNotifications(accountKey).map((item) => item.id));

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
  for (const message of rawMessages) {
    const notification = await parseMessage(message.buffer, message.uid);
    notifications.push(notification);
  }

  notifications.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const newCount = notifications.filter((item) => !previousIds.has(item.id)).length;
  writeNotifications(accountKey, notifications);

  if (!silent) {
    console.log(
      `[${accountKey}] Wrote ${notifications.length} notification(s) to ${account.feedFile}`,
    );
  }

  return {
    accountKey,
    unreadTotal: unreadUids.length,
    fetchedCount: selectedUids.length,
    newCount,
    writtenCount: notifications.length,
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
