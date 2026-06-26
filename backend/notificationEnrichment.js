const { triageNotification } = require('./serverTriage');
const {
  applyShadowLabelsToNotification,
  resolveShadowLabels,
} = require('./shadowLabels');
const { maybeSendPriorityPush } = require('./pushNotificationService');
const {
  resolveAttachmentContent,
  applyAttachmentScan,
} = require('./emailAttachments');
const {
  retrieveRelevantMemories,
  saveMemoryEntry,
  applyMemoryContext,
} = require('./memoryEngine');
const { syncTasksFromTriage } = require('./taskService');
const {
  auditCalendarForEmail,
  applyCalendarGuard,
} = require('./calendarIntentService');
const { maybeAutoPilot } = require('./autoPilotService');
const { maybeExtractFinance } = require('./financeExtractionService');

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
    gmailApiMessageId: incoming.gmailApiMessageId ?? existing.gmailApiMessageId,
    messageIdHeader: incoming.messageIdHeader ?? existing.messageIdHeader,
    attachmentScan: incoming.attachmentScan ?? existing.attachmentScan,
    memoryContext: incoming.memoryContext ?? existing.memoryContext,
    calendarGuard: incoming.calendarGuard ?? existing.calendarGuard,
    channelName: incoming.channelName ?? existing.channelName,
    replyTarget: incoming.replyTarget ?? existing.replyTarget,
    status: incoming.status ?? existing.status,
    autoPilot: incoming.autoPilot ?? existing.autoPilot,
  };
}

async function enrichNotifications(
  accountKey,
  notifications,
  existingNotifications = [],
  options = {},
) {
  const pendingAttachments = options.pendingAttachments || new Map();
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
      const mailparserAttachments = pendingAttachments.get(merged.id) || [];
      let attachmentContent = {
        images: [],
        pdfs: [],
        scanInfo: merged.attachmentScan ?? null,
        hasContent: false,
      };

      if (merged.sourceApp === 'Email') {
        try {
          attachmentContent = await resolveAttachmentContent(
            accountKey,
            merged,
            mailparserAttachments,
          );
        } catch (attachmentError) {
          console.warn(
            `[${accountKey}] Attachment scan failed for ${merged.id}:`,
            attachmentError instanceof Error ? attachmentError.message : attachmentError,
          );
        }
      }

      const withScan = applyAttachmentScan(merged, attachmentContent.scanInfo);

      let memoryRetrieval = { matches: [], injected: false, promptBlock: '' };
      try {
        memoryRetrieval = await retrieveRelevantMemories(accountKey, withScan);
      } catch (memoryError) {
        console.warn(
          `[${accountKey}] Memory retrieval failed for ${merged.id}:`,
          memoryError instanceof Error ? memoryError.message : memoryError,
        );
      }

      const withMemory = applyMemoryContext(withScan, memoryRetrieval);

      let calendarAudit = { guard: null, promptBlock: '' };
      if (merged.sourceApp === 'Email') {
        try {
          calendarAudit = await auditCalendarForEmail(accountKey, withMemory);
        } catch (calendarError) {
          console.warn(
            `[${accountKey}] Calendar audit failed for ${merged.id}:`,
            calendarError instanceof Error ? calendarError.message : calendarError,
          );
        }
      }

      const withCalendar = applyCalendarGuard(withMemory, calendarAudit.guard);
      const triage = await triageNotification(
        withCalendar,
        attachmentContent,
        memoryRetrieval.promptBlock,
        calendarAudit.promptBlock,
      );

      try {
        await saveMemoryEntry(accountKey, withCalendar, triage);
      } catch (memorySaveError) {
        console.warn(
          `[${accountKey}] Memory save failed for ${merged.id}:`,
          memorySaveError instanceof Error ? memorySaveError.message : memorySaveError,
        );
      }

      try {
        syncTasksFromTriage(accountKey, withCalendar, triage);
      } catch (taskError) {
        console.warn(
          `[${accountKey}] Task extraction failed for ${merged.id}:`,
          taskError instanceof Error ? taskError.message : taskError,
        );
      }

      let labeled;
      try {
        if (withCalendar.sourceApp === 'Email') {
          labeled = applyMemoryContext(
            await applyShadowLabelsToNotification(accountKey, withCalendar, triage),
            memoryRetrieval,
          );
        } else {
          labeled = applyMemoryContext(
            {
              ...withCalendar,
              triage,
              shadowLabels: resolveShadowLabels(withCalendar, triage),
            },
            memoryRetrieval,
          );
        }
      } catch (labelError) {
        console.warn(
          `[${accountKey}] Label apply failed for ${merged.id}:`,
          labelError instanceof Error ? labelError.message : labelError,
        );
        labeled = applyMemoryContext(
          {
            ...withCalendar,
            triage,
            shadowLabels: resolveShadowLabels(withCalendar, triage),
          },
          memoryRetrieval,
        );
      }

      try {
        await maybeExtractFinance(accountKey, labeled);
      } catch (financeError) {
        console.warn(
          `[${accountKey}] Finance extraction failed for ${merged.id}:`,
          financeError instanceof Error ? financeError.message : financeError,
        );
      }

      const pilotResult = await maybeAutoPilot(accountKey, labeled);
      if (pilotResult.handled) {
        continue;
      }

      enriched.push(pilotResult.notification);
      await maybeSendPriorityPush(accountKey, pilotResult.notification);
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
