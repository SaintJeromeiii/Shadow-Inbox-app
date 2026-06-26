const { getAccount } = require('./accounts');
const { fetchGmailAttachments } = require('./gmailAttachments');
const { processRawAttachments, isSupportedAttachmentMime, normalizeMimeType } = require('./attachmentProcessor');

function extractMailparserAttachments(parsed) {
  const attachments = [];

  for (const attachment of parsed.attachments || []) {
    const mimeType = normalizeMimeType(attachment.contentType);
    if (!isSupportedAttachmentMime(mimeType)) continue;

    attachments.push({
      filename: attachment.filename || attachment.cid || 'attachment',
      mimeType: attachment.contentType,
      content: attachment.content,
      size: attachment.size,
      source: 'imap-mailparser',
    });
  }

  return attachments;
}

function mergeRawAttachments(...groups) {
  const merged = [];
  const seen = new Set();

  for (const group of groups) {
    for (const item of group || []) {
      const key = `${item.mimeType}:${item.filename}:${item.size || 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

async function resolveAttachmentContent(accountKey, notification, mailparserAttachments = []) {
  const account = getAccount(accountKey);
  const rawGroups = [mailparserAttachments];

  if (account?.oauth) {
    try {
      const gmailAttachments = await fetchGmailAttachments(accountKey, notification);
      if (gmailAttachments.length > 0) {
        rawGroups.unshift(gmailAttachments);
      }
    } catch (error) {
      console.warn(
        `[EmailAttachments][${accountKey}] Gmail attachment scan failed for ${notification.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const rawAttachments = mergeRawAttachments(...rawGroups);
  if (rawAttachments.length === 0) {
    return {
      images: [],
      pdfs: [],
      scanInfo: notification.attachmentScan ?? null,
      hasContent: false,
    };
  }

  const processed = await processRawAttachments(rawAttachments);

  return {
    images: processed.images,
    pdfs: processed.pdfs,
    scanInfo: processed.scanInfo,
    hasContent: processed.items.length > 0,
  };
}

function applyAttachmentScan(notification, scanInfo) {
  if (!scanInfo) {
    return notification;
  }

  return {
    ...notification,
    attachmentScan: scanInfo,
  };
}

module.exports = {
  extractMailparserAttachments,
  resolveAttachmentContent,
  applyAttachmentScan,
};
