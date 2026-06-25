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

module.exports = {
  gmailApiRequest,
  listLabels,
  createLabel,
  modifyMessageLabels,
  resolveGmailMessageId,
};
