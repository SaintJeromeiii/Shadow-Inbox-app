import type { RawNotification } from '../types/notification';
import realNotificationsData from '../data/realNotifications.json';

type WrappedNotifications =
  | RawNotification[]
  | { notifications?: RawNotification[] }
  | { emails?: RawNotification[] };

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

  console.warn(
    '[Shadow Inbox] realNotifications.json has no recognizable notification array.',
  );
  return [];
}

export function getSeedNotifications(): RawNotification[] {
  return extractNotificationArray(realNotificationsData).map((notification) => ({
    ...notification,
  }));
}

export function getNotificationDataSource(): 'real' | 'empty' {
  return extractNotificationArray(realNotificationsData).length > 0
    ? 'real'
    : 'empty';
}
