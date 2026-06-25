import type { RawNotification } from '../types/notification';
import type { AccountKey } from '../types/account';
import personalNotificationsData from '../data/account_personal_notifications.json';
import workNotificationsData from '../data/account_work_notifications.json';

const BUNDLED_BY_ACCOUNT: Record<string, unknown> = {
  personal: personalNotificationsData,
  work: workNotificationsData,
};

function extractNotificationArray(data: unknown): RawNotification[] {
  if (Array.isArray(data)) {
    return data as RawNotification[];
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    if (Array.isArray(record.notifications)) {
      return record.notifications as RawNotification[];
    }

    if (Array.isArray(record.emails)) {
      return record.emails as RawNotification[];
    }
  }

  console.warn('[Shadow Inbox] Account notification file has no recognizable array.');
  return [];
}

export function getSeedNotifications(accountKey: AccountKey = 'personal'): RawNotification[] {
  const data = BUNDLED_BY_ACCOUNT[accountKey];
  if (!data) {
    return [];
  }

  return extractNotificationArray(data).map((notification) => ({
    ...notification,
  }));
}

export function getNotificationDataSource(accountKey: AccountKey = 'personal'): 'real' | 'empty' {
  return getSeedNotifications(accountKey).length > 0 ? 'real' : 'empty';
}
