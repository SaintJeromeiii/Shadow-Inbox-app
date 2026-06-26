const fs = require('fs');
const { getAccount, resolveAccountKey } = require('./accounts');
const { getSupabase, isSupabaseEnabled } = require('./supabaseClient');

function getFeedPath(accountKey) {
  const account = getAccount(resolveAccountKey(accountKey));
  if (!account) {
    throw new Error(`Unknown account key: ${accountKey}`);
  }
  return account.feedPath;
}

function readNotificationsFromFile(accountKey = 'personal') {
  const feedPath = getFeedPath(accountKey);

  try {
    const raw = fs.readFileSync(feedPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.notifications)) return parsed.notifications;
    if (Array.isArray(parsed?.emails)) return parsed.emails;
    return [];
  } catch {
    return [];
  }
}

function writeNotificationsToFile(accountKey, notifications) {
  const feedPath = getFeedPath(accountKey);
  fs.writeFileSync(
    feedPath,
    `${JSON.stringify(notifications, null, 2)}\n`,
    'utf8',
  );
}

function toNotificationRow(accountKey, notification) {
  const timestamp = notification.timestamp || new Date().toISOString();
  return {
    id: notification.id,
    account_key: resolveAccountKey(accountKey),
    payload: notification,
    sort_timestamp: timestamp,
    updated_at: new Date().toISOString(),
  };
}

async function readNotifications(accountKey = 'personal') {
  const resolvedKey = resolveAccountKey(accountKey);
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('notification_feed')
      .select('payload, sort_timestamp')
      .eq('account_key', resolvedKey)
      .order('sort_timestamp', { ascending: false });

    if (error) {
      throw new Error(`Failed to read notification feed: ${error.message}`);
    }

    return (data || []).map((row) => row.payload);
  }

  return readNotificationsFromFile(resolvedKey);
}

async function writeNotifications(accountKey, notifications) {
  const resolvedKey = resolveAccountKey(accountKey);
  const supabase = getSupabase();

  if (supabase) {
    const rows = notifications.map((notification) =>
      toNotificationRow(resolvedKey, notification),
    );

    const { error: deleteError } = await supabase
      .from('notification_feed')
      .delete()
      .eq('account_key', resolvedKey);

    if (deleteError) {
      throw new Error(`Failed to clear notification feed: ${deleteError.message}`);
    }

    if (rows.length === 0) {
      return;
    }

    const { error: insertError } = await supabase
      .from('notification_feed')
      .insert(rows);

    if (insertError) {
      throw new Error(`Failed to write notification feed: ${insertError.message}`);
    }

    return;
  }

  writeNotificationsToFile(resolvedKey, notifications);
}

async function removeNotificationIds(accountKey, ids) {
  const resolvedKey = resolveAccountKey(accountKey);
  const idSet = new Set(ids);
  const current = await readNotifications(resolvedKey);
  const filtered = current.filter((item) => !idSet.has(item.id));
  const removedCount = current.length - filtered.length;

  if (removedCount > 0) {
    const supabase = getSupabase();

    if (supabase) {
      const { error } = await supabase
        .from('notification_feed')
        .delete()
        .eq('account_key', resolvedKey)
        .in('id', [...idSet]);

      if (error) {
        throw new Error(`Failed to remove notifications: ${error.message}`);
      }
    } else {
      writeNotificationsToFile(resolvedKey, filtered);
    }
  }

  return { removedCount, remainingCount: filtered.length };
}

module.exports = {
  getFeedPath,
  readNotifications,
  writeNotifications,
  removeNotificationIds,
  isSupabaseEnabled,
};
