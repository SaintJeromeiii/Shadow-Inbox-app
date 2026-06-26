const { getAccount } = require('./accounts');
const { gmailApiRequest, resolveGmailMessageId } = require('./gmailApi');
const {
  isSupportedAttachmentMime,
  normalizeMimeType,
  MAX_ATTACHMENT_BYTES,
} = require('./attachmentProcessor');

function base64UrlToBuffer(data) {
  const normalized = String(data || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

function walkPayloadParts(parts, results = []) {
  for (const part of parts || []) {
    if (part.parts?.length) {
      walkPayloadParts(part.parts, results);
    }

    const mimeType = normalizeMimeType(part.mimeType);
    const attachmentId = part.body?.attachmentId;
    const size = Number(part.body?.size || 0);

    if (!attachmentId) continue;
    if (!isSupportedAttachmentMime(mimeType)) continue;
    if (size > MAX_ATTACHMENT_BYTES) continue;

    const filename = part.filename || `attachment-${attachmentId}`;

    results.push({
      filename,
      mimeType,
      attachmentId,
      size,
    });
  }

  return results;
}

function collectMessageAttachments(payload) {
  if (!payload) return [];

  if (payload.parts?.length) {
    return walkPayloadParts(payload.parts);
  }

  const mimeType = normalizeMimeType(payload.mimeType);
  const attachmentId = payload.body?.attachmentId;
  const size = Number(payload.body?.size || 0);

  if (
    attachmentId &&
    isSupportedAttachmentMime(mimeType) &&
    size <= MAX_ATTACHMENT_BYTES
  ) {
    return [
      {
        filename: payload.filename || `attachment-${attachmentId}`,
        mimeType,
        attachmentId,
        size,
      },
    ];
  }

  return [];
}

async function fetchGmailAttachmentData(accountKey, messageId, attachmentId) {
  const payload = await gmailApiRequest(
    accountKey,
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );

  if (!payload?.data) {
    throw new Error('Gmail attachment payload was empty.');
  }

  return base64UrlToBuffer(payload.data);
}

async function resolveApiMessageId(accountKey, notification) {
  if (notification.gmailApiMessageId) {
    return notification.gmailApiMessageId;
  }

  const subjectMatch = String(notification.rawText || '').match(/^Subject:\s*(.+)$/m);
  const subject = subjectMatch?.[1]?.trim();

  // notification.gmailMessageId is IMAP X-GM-MSGID — resolve the REST API id instead.
  const apiId = await resolveGmailMessageId(accountKey, {
    messageIdHeader: notification.messageIdHeader,
    subject,
    timestamp: notification.timestamp,
  });

  return apiId;
}

async function fetchGmailAttachments(accountKey, notification) {
  const account = getAccount(accountKey);
  if (!account?.oauth) {
    return [];
  }

  const messageId = await resolveApiMessageId(accountKey, notification);
  if (!messageId) {
    return [];
  }

  const message = await gmailApiRequest(
    accountKey,
    `/messages/${encodeURIComponent(messageId)}?format=full`,
  );

  const partDescriptors = collectMessageAttachments(message.payload);
  const rawAttachments = [];

  for (const part of partDescriptors) {
    try {
      const content = await fetchGmailAttachmentData(
        accountKey,
        messageId,
        part.attachmentId,
      );

      rawAttachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        content,
        size: content.length,
        source: 'gmail-api',
      });
    } catch (error) {
      console.warn(
        `[GmailAttachments][${accountKey}] Failed to fetch ${part.filename}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return rawAttachments;
}

module.exports = {
  walkPayloadParts,
  collectMessageAttachments,
  fetchGmailAttachments,
  resolveApiMessageId,
};
