const { withInbox } = require('./imapAuth');
const { removeShadowLabelsFromNotifications } = require('./shadowLabels');
const { getAccount, resolveAccountKey } = require('./accounts');
const { modifyMessageLabels } = require('./gmailApi');

/**
 * Gmail archive/trash via IMAP per account (password auth) or Gmail API (OAuth sync).
 * Notification IDs: "email-{imapUid}" or "gmail-{apiMessageId}".
 */

function moveMessages(imap, uids, destination) {
  return new Promise((resolve, reject) => {
    if (uids.length === 0) {
      resolve({ moved: 0 });
      return;
    }

    imap.move(uids, destination, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ moved: uids.length });
    });
  });
}

function parseNotificationId(id) {
  if (typeof id !== 'string' || !id.trim()) {
    return null;
  }

  const imapMatch = id.trim().match(/^email-(\d+)$/i);
  if (imapMatch) {
    return { kind: 'uid', uid: Number(imapMatch[1]), sourceId: id };
  }

  const gmailApiMatch = id.trim().match(/^gmail-(.+)$/i);
  if (gmailApiMatch) {
    return { kind: 'gmail_api', messageId: gmailApiMatch[1], sourceId: id };
  }

  const threadMatch = id.trim().match(/^thread-(.+)$/i);
  if (threadMatch) {
    return { kind: 'thread', threadId: threadMatch[1], sourceId: id };
  }

  if (/^\d+$/.test(id.trim())) {
    return { kind: 'uid', uid: Number(id.trim()), sourceId: `email-${id.trim()}` };
  }

  return { kind: 'unknown', sourceId: id };
}

function extractUids(ids) {
  const parsed = ids.map(parseNotificationId).filter(Boolean);
  const uids = parsed.filter((item) => item.kind === 'uid').map((item) => item.uid);
  const gmailApiIds = parsed
    .filter((item) => item.kind === 'gmail_api')
    .map((item) => item.messageId);
  const unsupported = parsed
    .filter((item) => item.kind !== 'uid' && item.kind !== 'gmail_api')
    .map((item) => item.sourceId);

  return { uids, gmailApiIds, unsupported, parsed };
}

async function archiveGmailApiMessages(accountKey, messageIds) {
  let archived = 0;

  for (const messageId of messageIds) {
    try {
      await modifyMessageLabels(accountKey, messageId, {
        removeLabelIds: ['INBOX'],
      });
      archived += 1;
    } catch (error) {
      console.warn(
        `[${accountKey}] Could not archive Gmail message ${messageId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return archived;
}

async function trashGmailApiMessages(accountKey, messageIds) {
  let trashed = 0;

  for (const messageId of messageIds) {
    try {
      await modifyMessageLabels(accountKey, messageId, {
        addLabelIds: ['TRASH'],
        removeLabelIds: ['INBOX'],
      });
      trashed += 1;
    } catch (error) {
      console.warn(
        `[${accountKey}] Could not trash Gmail message ${messageId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return trashed;
}

async function archiveMessages(accountKey, ids, notifications = []) {
  const { uids, gmailApiIds, unsupported } = extractUids(ids);
  const account = getAccount(resolveAccountKey(accountKey));

  if (notifications.length > 0) {
    try {
      await removeShadowLabelsFromNotifications(accountKey, notifications);
    } catch (error) {
      console.warn(`[${accountKey}] Could not remove Shadow labels before archive:`, error.message);
    }
  }

  let archived = 0;

  if (account?.oauth && gmailApiIds.length > 0) {
    archived += await archiveGmailApiMessages(accountKey, gmailApiIds);
  }

  if (uids.length === 0) {
    return { archived, unsupported };
  }

  const result = await withInbox(accountKey, (imap) =>
    moveMessages(imap, uids, '[Gmail]/All Mail'),
  );

  return { archived: archived + result.moved, unsupported };
}

async function trashMessages(accountKey, ids, notifications = []) {
  const { uids, gmailApiIds, unsupported } = extractUids(ids);
  const account = getAccount(resolveAccountKey(accountKey));

  if (notifications.length > 0) {
    try {
      await removeShadowLabelsFromNotifications(accountKey, notifications);
    } catch (error) {
      console.warn(`[${accountKey}] Could not remove Shadow labels before trash:`, error.message);
    }
  }

  let trashed = 0;

  if (account?.oauth && gmailApiIds.length > 0) {
    trashed += await trashGmailApiMessages(accountKey, gmailApiIds);
  }

  if (uids.length === 0) {
    return { trashed, unsupported };
  }

  const result = await withInbox(accountKey, (imap) =>
    moveMessages(imap, uids, '[Gmail]/Trash'),
  );

  return { trashed: trashed + result.moved, unsupported };
}

module.exports = {
  archiveMessages,
  trashMessages,
  parseNotificationId,
  extractUids,
};
