const { getAccount, resolveAccountKey } = require('./accounts');
const { getValidAccessToken } = require('./googleOAuth');

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailApiRequest(accountKey, path, options = {}) {
  const account = getAccount(resolveAccountKey(accountKey));
  if (!account?.oauth) {
    throw new Error(`Gmail API is only available for linked Google accounts (${accountKey}).`);
  }

  const accessToken = await getValidAccessToken(accountKey);
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        payload?.error ||
        `Gmail API request failed (${response.status})`,
    );
  }

  return payload;
}

function formatMessageIdHeader(messageIdHeader) {
  if (!messageIdHeader) return null;
  const trimmed = String(messageIdHeader).trim();
  if (!trimmed) return null;
  return trimmed.startsWith('<') ? trimmed : `<${trimmed}>`;
}

function encodeMimeForGmail(mime) {
  return Buffer.from(mime)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildPlainTextMime({ from, to, subject, body, inReplyTo, references }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
  ];

  const replyHeader = formatMessageIdHeader(inReplyTo);
  if (replyHeader) {
    lines.push(`In-Reply-To: ${replyHeader}`);
    lines.push(`References: ${references || replyHeader}`);
  }

  lines.push('', String(body || '').trim());
  return lines.join('\r\n');
}

async function resolveThreadId(accountKey, gmailApiMessageId) {
  if (!gmailApiMessageId) return null;

  try {
    const payload = await gmailApiRequest(
      accountKey,
      `/messages/${encodeURIComponent(gmailApiMessageId)}?format=metadata`,
    );
    return payload.threadId || null;
  } catch (error) {
    console.warn(
      `[GmailAPI] Could not resolve thread for message ${gmailApiMessageId}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Send email via Gmail REST API (HTTPS). Use for OAuth-linked accounts on Railway
 * where outbound SMTP (smtp.gmail.com) is blocked or unreachable.
 */
async function sendGmailMessage(accountKey, {
  to,
  subject,
  body,
  inReplyTo = null,
  references = null,
  gmailApiMessageId = null,
}) {
  const account = getAccount(resolveAccountKey(accountKey));
  if (!account?.oauth) {
    throw new Error(`Gmail API send requires a linked Google account (${accountKey}).`);
  }

  const from = account.email;
  if (!from) {
    throw new Error(`No sender email configured for account "${accountKey}".`);
  }

  const threadId = await resolveThreadId(accountKey, gmailApiMessageId);
  const raw = encodeMimeForGmail(
    buildPlainTextMime({
      from,
      to,
      subject,
      body,
      inReplyTo,
      references,
    }),
  );

  const payload = { raw };
  if (threadId) {
    payload.threadId = threadId;
  }

  return gmailApiRequest(accountKey, '/messages/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function listLabels(accountKey) {
  const payload = await gmailApiRequest(accountKey, '/labels');
  return payload.labels || [];
}

async function createLabel(accountKey, name) {
  return gmailApiRequest(accountKey, '/labels', {
    method: 'POST',
    body: JSON.stringify({
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    }),
  });
}

async function modifyMessageLabels(accountKey, messageId, { addLabelIds = [], removeLabelIds = [] }) {
  if (!messageId) {
    throw new Error('Missing Gmail message id for label modify.');
  }

  return gmailApiRequest(accountKey, `/messages/${encodeURIComponent(messageId)}/modify`, {
    method: 'POST',
    body: JSON.stringify({
      addLabelIds,
      removeLabelIds,
    }),
  });
}

async function resolveGmailMessageId(accountKey, { messageIdHeader, subject, timestamp }) {
  if (!messageIdHeader && !subject) {
    return null;
  }

  const queries = [];
  if (messageIdHeader) {
    const normalized = messageIdHeader.replace(/[<>]/g, '');
    queries.push(`rfc822msgid:${normalized}`);
  }
  if (subject) {
    queries.push(`subject:"${subject.replace(/"/g, '')}" newer_than:14d`);
  }

  for (const query of queries) {
    const payload = await gmailApiRequest(
      accountKey,
      `/messages?q=${encodeURIComponent(query)}&maxResults=5`,
    );

    const match = (payload.messages || [])[0];
    if (match?.id) {
      return match.id;
    }
  }

  if (timestamp) {
    const afterSeconds = Math.floor(new Date(timestamp).getTime() / 1000) - 3600;
    const query = `after:${afterSeconds}${subject ? ` subject:"${subject.replace(/"/g, '')}"` : ''}`;
    const payload = await gmailApiRequest(
      accountKey,
      `/messages?q=${encodeURIComponent(query)}&maxResults=5`,
    );
    const match = (payload.messages || [])[0];
    if (match?.id) {
      return match.id;
    }
  }

  return null;
}

const GMAIL_LIST_PAGE_SIZE = 100;
const GMAIL_UNREAD_QUERY = 'is:unread in:inbox';

/**
 * List unread inbox messages (single Gmail API page).
 */
async function listUnreadInboxMessages(
  accountKey,
  { maxResults = GMAIL_LIST_PAGE_SIZE, pageToken = null, query = GMAIL_UNREAD_QUERY } = {},
) {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  return gmailApiRequest(accountKey, `/messages?${params.toString()}`);
}

/**
 * Walk nextPageToken until the full unread backlog is collected.
 */
async function listAllUnreadInboxMessageIds(accountKey, options = {}) {
  const maxResults = options.maxResults || GMAIL_LIST_PAGE_SIZE;
  const query = options.query || GMAIL_UNREAD_QUERY;
  const hardCap =
    options.hardCap ??
    (Number(process.env.FETCH_MAX_UNREAD_CAP) > 0
      ? Number(process.env.FETCH_MAX_UNREAD_CAP)
      : 500);

  const ids = [];
  let pageToken = null;

  do {
    const payload = await listUnreadInboxMessages(accountKey, {
      maxResults,
      pageToken,
      query,
    });

    for (const message of payload.messages || []) {
      if (message?.id) {
        ids.push(message.id);
      }
      if (ids.length >= hardCap) {
        break;
      }
    }

    if (ids.length >= hardCap) {
      break;
    }

    pageToken = payload.nextPageToken || null;
  } while (pageToken);

  return ids;
}

async function getGmailMessageRaw(accountKey, messageId) {
  const payload = await gmailApiRequest(
    accountKey,
    `/messages/${encodeURIComponent(messageId)}?format=raw`,
  );

  if (!payload?.raw) {
    throw new Error(`Gmail message ${messageId} did not include raw content.`);
  }

  const normalized = payload.raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

module.exports = {
  gmailApiRequest,
  sendGmailMessage,
  listLabels,
  createLabel,
  modifyMessageLabels,
  resolveGmailMessageId,
  listUnreadInboxMessages,
  listAllUnreadInboxMessageIds,
  getGmailMessageRaw,
  GMAIL_LIST_PAGE_SIZE,
  GMAIL_UNREAD_QUERY,
};
