const { withInbox } = require('./imapAuth');

/**
 * Gmail archive/trash via IMAP per account.
 * Notification IDs use IMAP UIDs: "email-{uid}".
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
  const unsupported = parsed
    .filter((item) => item.kind !== 'uid')
    .map((item) => item.sourceId);

  return { uids, unsupported, parsed };
}

async function archiveMessages(accountKey, ids) {
  const { uids, unsupported } = extractUids(ids);

  if (uids.length === 0) {
    return { archived: 0, unsupported };
  }

  const result = await withInbox(accountKey, (imap) =>
    moveMessages(imap, uids, '[Gmail]/All Mail'),
  );

  return { archived: result.moved, unsupported };
}

async function trashMessages(accountKey, ids) {
  const { uids, unsupported } = extractUids(ids);

  if (uids.length === 0) {
    return { trashed: 0, unsupported };
  }

  const result = await withInbox(accountKey, (imap) =>
    moveMessages(imap, uids, '[Gmail]/Trash'),
  );

  return { trashed: result.moved, unsupported };
}

module.exports = {
  archiveMessages,
  trashMessages,
  parseNotificationId,
  extractUids,
};
