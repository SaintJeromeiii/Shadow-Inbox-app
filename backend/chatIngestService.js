const { readNotifications, writeNotifications } = require('./notificationFeed');
const { enrichNotifications } = require('./notificationEnrichment');

const MAX_FEED_ITEMS = 50;

async function ingestPlatformMessages(accountKey, incomingNotifications = []) {
  if (!Array.isArray(incomingNotifications) || incomingNotifications.length === 0) {
    const total = (await readNotifications(accountKey)).length;
    return { ingested: 0, total };
  }

  const existing = await readNotifications(accountKey);
  const existingIds = new Set(existing.map((item) => item.id));
  const fresh = incomingNotifications.filter((item) => item?.id && !existingIds.has(item.id));

  if (fresh.length === 0) {
    return { ingested: 0, total: existing.length };
  }

  const enriched = await enrichNotifications(accountKey, fresh, existing);
  const enrichedIds = new Set(enriched.map((item) => item.id));
  const preserved = existing.filter((item) => !enrichedIds.has(item.id));

  const merged = [...enriched, ...preserved].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  await writeNotifications(accountKey, merged.slice(0, MAX_FEED_ITEMS));

  return {
    ingested: enriched.length,
    total: Math.min(merged.length, MAX_FEED_ITEMS),
    blocked: fresh.length - enriched.length,
  };
}

module.exports = {
  ingestPlatformMessages,
};
