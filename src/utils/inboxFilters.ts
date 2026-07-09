import type { TriagedNotification } from '../types/notification';

export type InboxQuickFilter = 'all' | 'priority' | 'attachments' | 'recent' | 'snoozed';

export const INBOX_QUICK_FILTERS: Array<{ key: InboxQuickFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'priority', label: 'Priority' },
  { key: 'attachments', label: 'Attachments' },
  { key: 'recent', label: 'This week' },
  { key: 'snoozed', label: 'Snoozed' },
];

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const PRIORITY_URGENCY_THRESHOLD = 7;

export function isCurrentlySnoozed(notification: TriagedNotification): boolean {
  if (!notification.snoozedUntil) {
    return false;
  }

  const snoozedUntil = new Date(notification.snoozedUntil).getTime();
  return Number.isFinite(snoozedUntil) && snoozedUntil > Date.now();
}

function parseSubjectFromRaw(rawText: string): string {
  const match = rawText.match(/^Subject:\s*(.+)$/m);
  return match?.[1]?.trim() ?? '';
}

function notificationSearchText(notification: TriagedNotification): string {
  return [
    notification.sender,
    parseSubjectFromRaw(notification.rawText),
    notification.rawText,
    notification.triage?.cleanSummary ?? '',
    notification.sourceApp,
    notification.channelName ?? '',
  ]
    .join('\n')
    .toLowerCase();
}

export function matchesInboxSearch(
  notification: TriagedNotification,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = notificationSearchText(notification);
  return normalized.split(/\s+/).every((term) => haystack.includes(term));
}

export function matchesQuickFilter(
  notification: TriagedNotification,
  filter: InboxQuickFilter,
): boolean {
  switch (filter) {
    case 'all':
      return !isCurrentlySnoozed(notification);
    case 'priority':
      return (
        !isCurrentlySnoozed(notification) &&
        (notification.triage?.urgencyScore ?? 0) >= PRIORITY_URGENCY_THRESHOLD
      );
    case 'attachments':
      return (
        !isCurrentlySnoozed(notification) &&
        Boolean(
        notification.attachmentScan?.hasImage ||
          notification.attachmentScan?.hasPdf ||
          (notification.attachmentScan?.labels?.length ?? 0) > 0,
        )
      );
    case 'recent': {
      if (isCurrentlySnoozed(notification)) {
        return false;
      }
      const timestamp = new Date(notification.timestamp).getTime();
      return Number.isFinite(timestamp) && Date.now() - timestamp <= RECENT_MS;
    }
    case 'snoozed':
      return isCurrentlySnoozed(notification);
    default:
      return true;
  }
}

export function filterInboxNotifications(
  notifications: TriagedNotification[],
  options: { query: string; quickFilter: InboxQuickFilter },
): TriagedNotification[] {
  return notifications.filter(
    (notification) =>
      matchesInboxSearch(notification, options.query) &&
      matchesQuickFilter(notification, options.quickFilter),
  );
}
