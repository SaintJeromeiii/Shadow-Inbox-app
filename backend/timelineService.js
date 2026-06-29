const { listAccounts, resolveFinanceAccountKeys } = require('./accounts');
const { readNotifications } = require('./notificationFeed');

function extractSubject(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match ? match[1].trim() : '(No subject)';
}

function getTodayBounds() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    start,
    end,
    dayKey: start.toISOString().slice(0, 10),
  };
}

function isWithinToday(isoTimestamp, bounds) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return false;
  return date >= bounds.start && date <= bounds.end;
}

function toHourBucketKey(isoTimestamp) {
  const date = new Date(isoTimestamp);
  const bucket = new Date(date);
  bucket.setMinutes(0, 0, 0);
  return bucket.toISOString();
}

function toMilitaryHourLabel(isoTimestamp) {
  const date = new Date(isoTimestamp);
  return `${String(date.getHours()).padStart(2, '0')}00`;
}

function toDisplayHour(isoTimestamp) {
  const date = new Date(isoTimestamp);
  return `${String(date.getHours()).padStart(2, '0')}:00`;
}

function normalizeTimelineItem(notification, accountLabel) {
  const category = notification.triage?.category ?? 'untriaged';
  const urgencyScore = notification.triage?.urgencyScore ?? null;
  const summary =
    notification.triage?.cleanSummary ??
    String(notification.rawText || '').slice(0, 200);

  return {
    id: notification.id,
    accountLabel,
    sender: notification.sender,
    subject: extractSubject(notification.rawText),
    sourceApp: notification.sourceApp || 'Email',
    category,
    urgencyScore,
    summary,
    timestamp: notification.timestamp,
    isSystemAlert: /crash|alert|error|sentry|fatal|exception|down|incident/i.test(
      `${extractSubject(notification.rawText)} ${summary} ${notification.sender}`,
    ),
  };
}

function inferPeakUrgency(items) {
  if (items.length === 0) return 'low';

  let peak = 'low';

  for (const item of items) {
    const score = Number(item.urgencyScore);
    if (item.isSystemAlert || (Number.isFinite(score) && score >= 8)) {
      return 'critical';
    }
    if (item.category === 'action_required') {
      if (Number.isFinite(score) && score >= 6) {
        peak = 'elevated';
      } else if (peak === 'low') {
        peak = 'routine';
      }
    } else if (item.category === 'fyi' && peak === 'low') {
      peak = 'routine';
    }
  }

  return peak;
}

function buildHourSummary(items, counts) {
  const parts = [];

  if (counts.systemAlerts > 0) {
    parts.push(
      `${counts.systemAlerts} System Alert${counts.systemAlerts === 1 ? '' : 's'}`,
    );
  }

  if (counts.actionRequired > 0) {
    parts.push(
      `${counts.actionRequired} High Priority Email${counts.actionRequired === 1 ? '' : 's'}`,
    );
  }

  if (counts.fyi > 0) {
    parts.push(`${counts.fyi} FYI`);
  }

  if (counts.ignore > 0) {
    parts.push(`${counts.ignore} Low Signal`);
  }

  if (counts.untriaged > 0) {
    parts.push(`${counts.untriaged} Untriaged`);
  }

  if (parts.length === 0) {
    return `${counts.total} signal${counts.total === 1 ? '' : 's'}`;
  }

  return parts.join(', ');
}

function buildHourBlock(hourKey, items) {
  const counts = {
    total: items.length,
    actionRequired: items.filter((item) => item.category === 'action_required').length,
    fyi: items.filter((item) => item.category === 'fyi').length,
    ignore: items.filter((item) => item.category === 'ignore').length,
    untriaged: items.filter((item) => item.category === 'untriaged').length,
    systemAlerts: items.filter((item) => item.isSystemAlert).length,
  };

  const sortedItems = [...items].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const firstTimestamp = sortedItems[0]?.timestamp ?? hourKey;

  return {
    hourKey,
    hourLabel: toMilitaryHourLabel(firstTimestamp),
    displayTime: toDisplayHour(firstTimestamp),
    summary: buildHourSummary(sortedItems, counts),
    peakUrgency: inferPeakUrgency(sortedItems),
    counts,
    items: sortedItems,
  };
}

async function resolveTimelineAccountKeys(accountKey) {
  if (!accountKey || accountKey === 'all') {
    return listAccounts().map((account) => account.key);
  }

  return resolveFinanceAccountKeys(accountKey);
}

async function buildTimeline({ accountKey = null } = {}) {
  const bounds = getTodayBounds();
  let accountKeys = await resolveTimelineAccountKeys(accountKey);
  if (accountKey && accountKeys.includes(accountKey)) {
    accountKeys = [accountKey, ...accountKeys.filter((key) => key !== accountKey)];
  }

  const accounts = listAccounts();
  const accountLabelByKey = new Map(
    accounts.map((account) => [account.key, account.label]),
  );

  const buckets = new Map();
  const seenNotificationIds = new Set();

  for (const key of accountKeys) {
    const notifications = await readNotifications(key);
    const accountLabel = accountLabelByKey.get(key) || key;

    for (const notification of notifications) {
      if (seenNotificationIds.has(notification.id)) continue;
      if (notification.archived) continue;
      if (!isWithinToday(notification.timestamp, bounds)) continue;

      seenNotificationIds.add(notification.id);
      const item = normalizeTimelineItem(notification, accountLabel);
      const hourKey = toHourBucketKey(notification.timestamp);

      if (!buckets.has(hourKey)) {
        buckets.set(hourKey, []);
      }

      buckets.get(hourKey).push(item);
    }
  }

  const blocks = [...buckets.entries()]
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
    .map(([hourKey, items]) => buildHourBlock(hourKey, items));

  return {
    success: true,
    accountKey: accountKey || 'all',
    dayKey: bounds.dayKey,
    blockCount: blocks.length,
    signalCount: blocks.reduce((sum, block) => sum + block.counts.total, 0),
    blocks,
  };
}

module.exports = {
  buildTimeline,
  getTodayBounds,
};
