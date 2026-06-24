#!/usr/bin/env node
/**
 * Fetches unread emails via IMAP and writes them to src/data/realNotifications.json.
 *
 * Required env vars:
 *   IMAP_USER, IMAP_PASSWORD, IMAP_HOST, IMAP_PORT
 *
 * Usage:
 *   node scripts/fetchNotifications.js
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'realNotifications.json');
const MAX_UNREAD = 15;

function getImapConfig() {
  return {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
  };
}

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function validateImapConfig() {
  const { user, password, host, port } = getImapConfig();
  requireEnv('IMAP_USER', user);
  requireEnv('IMAP_PASSWORD', password);
  requireEnv('IMAP_HOST', host);
  return { user, password, host, port };
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
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

function readExistingIds() {
  try {
    const raw = fs.readFileSync(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.notifications)
        ? parsed.notifications
        : Array.isArray(parsed?.emails)
          ? parsed.emails
          : [];
    return new Set(list.map((item) => item.id));
  } catch {
    return new Set();
  }
}

function openInbox(config) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.port === 993,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }
        resolve(imap);
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
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
 * @param {{ silent?: boolean }} options
 * @returns {Promise<{ unreadTotal: number, fetchedCount: number, newCount: number, writtenCount: number }>}
 */
async function fetchNotifications(options = {}) {
  const { silent = false } = options;
  const config = validateImapConfig();
  const previousIds = readExistingIds();

  if (!silent) {
    console.log(`Connecting to ${config.host}:${config.port} as ${config.user}...`);
  }

  const imap = await openInbox(config);
  const unreadUids = await searchUnread(imap);
  const selectedUids = unreadUids.slice(-MAX_UNREAD).reverse();

  if (!silent) {
    console.log(
      `Found ${unreadUids.length} unread message(s). Fetching ${selectedUids.length}...`,
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

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(notifications, null, 2)}\n`, 'utf8');

  if (!silent) {
    console.log(`Wrote ${notifications.length} notification(s) to ${OUTPUT_PATH}`);
  }

  return {
    unreadTotal: unreadUids.length,
    fetchedCount: selectedUids.length,
    newCount,
    writtenCount: notifications.length,
  };
}

module.exports = { fetchNotifications };

if (require.main === module) {
  fetchNotifications()
    .then((stats) => {
      console.log(
        `Done — ${stats.unreadTotal} unread, ${stats.newCount} new, ${stats.writtenCount} written.`,
      );
    })
    .catch((error) => {
      console.error('Failed to fetch notifications:', error);
      process.exit(1);
    });
}
