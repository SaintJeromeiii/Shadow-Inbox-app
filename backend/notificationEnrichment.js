const { triageNotification } = require('./serverTriage');
const {
  applyShadowLabelsToNotification,
} = require('./shadowLabels');

function mergeNotification(existing, incoming) {
  if (!existing) {
    return incoming;
  }

  return {
    ...existing,
    ...incoming,
    triage: incoming.triage ?? existing.triage,
    shadowLabels: incoming.shadowLabels ?? existing.shadowLabels,
    gmailMessageId: incoming.gmailMessageId ?? existing.gmailMessageId,
    messageIdHeader: incoming.messageIdHeader ?? existing.messageIdHeader,
  };
}

async function enrichNotifications(accountKey, notifications, existingNotifications = []) {
  const existingById = new Map(existingNotifications.map((item) => [item.id, item]));
  const enriched = [];

  for (const notification of notifications) {
    const previous = existingById.get(notification.id);
    const merged = mergeNotification(previous, notification);

    if (merged.triage && merged.shadowLabels?.length) {
      enriched.push(merged);
      continue;
    }

    if (merged.triage && !merged.shadowLabels?.length) {
      try {
        const labeled = await applyShadowLabelsToNotification(
          accountKey,
          merged,
          merged.triage,
        );
        enriched.push(labeled);
      } catch (error) {
        console.warn(
          `[${accountKey}] Could not apply labels to ${merged.id}:`,
          error.message,
        );
        enriched.push(merged);
      }
      continue;
    }

    try {
      const triage = await triageNotification(merged);
      const labeled = await applyShadowLabelsToNotification(accountKey, merged, triage);
      enriched.push(labeled);
    } catch (error) {
      console.warn(`[${accountKey}] Triage failed for ${merged.id}:`, error.message);
      enriched.push(merged);
    }
  }

  return enriched;
}

module.exports = {
  mergeNotification,
  enrichNotifications,
};
