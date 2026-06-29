const { listAccounts, listAccountKeys } = require('./accounts');
const { readNotifications } = require('./notificationFeed');
const { appendExecutiveBrief } = require('./executiveBriefsLedger');

const REQUEST_TIMEOUT_MS = 45_000;
const BRIEFING_WINDOW_HOURS = 24;

const EXECUTIVE_BRIEFING_SYSTEM_PROMPT = `You are the chief of a shadow detective bureau writing a daily Crime Bulletin. Summarize the last 24 hours of incoming data streams into a clean, highly scannable Markdown format.

Structure it exactly like this:

### CRIME BULLETIN
- [2-sentence high-level overview of active signals]

### ACTION ITEMS & PRIORITIES
- **[High]** [Actionable item extracted from logs]
- **[Routine]** [General maintenance/follow-up task]

### SIGNAL FILTERING
A brief Markdown table matching: | Source | Critical Alert | Noise Status |

Rules:
- Use the exact section headers shown above.
- Prioritize action_required and high-urgency signals in **[High]** bullets.
- Deprioritize FYI, newsletters, and ignore-classified noise in the Signal Filtering table.
- Be concise — Jerome reads this on his phone in under 60 seconds.
- No preamble, no sign-off, no filler phrases.
- Reference specific senders or subjects when it adds clarity.`;

const QUIET_BRIEFING_MARKDOWN = `### CRIME BULLETIN
- System quiet over the last 24 hours.
- No inbound signals were detected across monitored data streams.

### ACTION ITEMS & PRIORITIES
- **[Routine]** No immediate action items — inbox is clear.

### SIGNAL FILTERING
| Source | Critical Alert | Noise Status |
| --- | --- | --- |
| All channels | None | Quiet |`;

function getOpenAiConfig() {
  return {
    apiKey:
      process.env.OPENAI_API_KEY ||
      process.env.EXPO_PUBLIC_OPENAI_API_KEY ||
      '',
    apiUrl:
      process.env.LLM_API_URL ||
      process.env.EXPO_PUBLIC_LLM_API_URL ||
      'https://api.openai.com/v1/chat/completions',
    model:
      process.env.LLM_MODEL ||
      process.env.EXPO_PUBLIC_LLM_MODEL ||
      'gpt-4o-mini',
  };
}

function isPlaceholderApiKey(key) {
  const normalized = String(key || '').trim();
  return (
    !normalized ||
    normalized === 'YOUR_API_KEY_HERE' ||
    normalized.includes('your_openai')
  );
}

function extractSubject(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match ? match[1].trim() : '(No subject)';
}

function isWithinLastHours(isoTimestamp, hours = BRIEFING_WINDOW_HOURS) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}

function mergeTriageOverlay(notifications, triageItems) {
  if (!Array.isArray(triageItems) || triageItems.length === 0) {
    return notifications;
  }

  const triageById = new Map(triageItems.map((item) => [item.id, item]));

  return notifications.map((notification) => {
    const overlay = triageById.get(notification.id);
    if (!overlay) return notification;

    return {
      ...notification,
      triage: overlay.triage ?? notification.triage,
      archived: overlay.archived ?? notification.archived,
    };
  });
}

function inferUrgencyLevel(items) {
  if (items.length === 0) return 'low';

  const actionRequired = items.filter((item) => item.category === 'action_required');
  const maxUrgency = actionRequired.reduce((max, item) => {
    const score = Number(item.urgencyScore);
    return Number.isFinite(score) ? Math.max(max, score) : max;
  }, 0);

  if (maxUrgency >= 8) return 'critical';
  if (maxUrgency >= 6 || actionRequired.length >= 3) return 'elevated';
  if (actionRequired.length > 0) return 'routine';
  return 'low';
}

function buildBriefingStats(items, accountCount) {
  return {
    signalCount: items.length,
    totalToday: items.length,
    actionRequired: items.filter((item) => item.category === 'action_required').length,
    fyi: items.filter((item) => item.category === 'fyi').length,
    ignore: items.filter((item) => item.category === 'ignore').length,
    untriaged: items.filter((item) => item.category === 'untriaged').length,
    accountCount,
  };
}

async function buildBriefingItemsLast24Hours({
  accountKey = null,
  triageByAccount = null,
  hours = BRIEFING_WINDOW_HOURS,
} = {}) {
  const accounts = listAccounts().filter((account) =>
    accountKey ? account.key === accountKey : true,
  );
  const items = [];

  for (const account of accounts) {
    const rawNotifications = await readNotifications(account.key);
    const overlay = triageByAccount?.[account.key];
    const notifications = mergeTriageOverlay(rawNotifications, overlay);

    for (const notification of notifications) {
      if (notification.archived) continue;
      if (!isWithinLastHours(notification.timestamp, hours)) continue;

      items.push({
        accountKey: account.key,
        accountLabel: account.label,
        id: notification.id,
        sender: notification.sender,
        subject: extractSubject(notification.rawText),
        category: notification.triage?.category ?? 'untriaged',
        summary:
          notification.triage?.cleanSummary ??
          String(notification.rawText || '').slice(0, 200),
        urgencyScore: notification.triage?.urgencyScore ?? null,
        timestamp: notification.timestamp,
      });
    }
  }

  items.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return { accounts, items };
}

function buildQuietBriefing({ accountKey = null } = {}) {
  const generatedAt = new Date().toISOString();

  return {
    success: true,
    quiet: true,
    message: 'System quiet over the last 24 hours.',
    generatedAt,
    briefingDate: generatedAt.slice(0, 10),
    markdown: QUIET_BRIEFING_MARKDOWN,
    summaryText: QUIET_BRIEFING_MARKDOWN,
    urgencyLevel: 'low',
    mode: 'quiet',
    warning: null,
    stats: buildBriefingStats([], accountKey ? 1 : listAccounts().length),
    accountKeys: accountKey ? [accountKey] : listAccountKeys(),
    accountKey: accountKey || 'all',
  };
}

function formatStoredBriefing(stored) {
  return {
    success: true,
    quiet: stored.signalCount === 0,
    message: stored.signalCount === 0 ? 'System quiet over the last 24 hours.' : null,
    id: stored.id,
    generatedAt: stored.createdAt,
    briefingDate: String(stored.createdAt || '').slice(0, 10),
    markdown: stored.summaryText,
    summaryText: stored.summaryText,
    urgencyLevel: stored.urgencyLevel,
    mode: stored.mode,
    warning: null,
    stats: {
      signalCount: stored.signalCount,
      totalToday: stored.signalCount,
      actionRequired: 0,
      fyi: 0,
      ignore: 0,
      untriaged: 0,
      accountCount: 0,
    },
    accountKey: stored.accountKey,
    accountKeys: stored.accountKey === 'all' ? listAccountKeys() : [stored.accountKey],
  };
}

async function callExecutiveBriefingLlm({ items, knowledgeBase }) {
  const { apiKey, apiUrl, model } = getOpenAiConfig();

  if (isPlaceholderApiKey(apiKey)) {
    return {
      markdown: buildFallbackBriefing(items),
      mode: 'fallback',
      warning: 'OpenAI API key missing — using local briefing summary.',
    };
  }

  const userPayload = {
    windowHours: BRIEFING_WINDOW_HOURS,
    signalCount: items.length,
    signals: items,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `${EXECUTIVE_BRIEFING_SYSTEM_PROMPT}\n\nOperational context:\n"""\n${knowledgeBase}\n"""`,
          },
          {
            role: 'user',
            content: `Generate the executive intelligence brief from these last-24-hour signals:\n\n${JSON.stringify(userPayload, null, 2)}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ||
          payload?.error ||
          `Briefing LLM request failed (${response.status})`,
      );
    }

    const markdown = payload?.choices?.[0]?.message?.content?.trim();
    if (!markdown) {
      throw new Error('Briefing LLM returned an empty response.');
    }

    return { markdown, mode: 'live' };
  } catch (error) {
    console.warn('[Briefing] LLM call failed, using fallback:', error);
    return {
      markdown: buildFallbackBriefing(items),
      mode: 'fallback',
      warning:
        error instanceof Error ? error.message : 'Briefing generation failed.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildFallbackBriefing(items) {
  if (items.length === 0) {
    return QUIET_BRIEFING_MARKDOWN;
  }

  const actionRequired = items.filter((item) => item.category === 'action_required');
  const routine = items.filter((item) => item.category !== 'action_required');

  const sitrep =
    actionRequired.length > 0
      ? `- ${actionRequired.length} priority signal(s) require attention in the last 24 hours.\n- ${items.length} total inbound items were captured across monitored inboxes.`
      : `- ${items.length} inbound signal(s) arrived in the last 24 hours with no critical escalations.\n- Inbox activity is manageable with routine follow-up only.`;

  const priorityLines =
    actionRequired.length > 0
      ? actionRequired
          .slice(0, 5)
          .map(
            (item) =>
              `- **[High]** ${item.subject} — ${item.sender} (${item.accountLabel})`,
          )
          .join('\n')
      : '- **[Routine]** No high-priority action items detected.';

  const routineLines =
    routine.length > 0
      ? routine
          .slice(0, 4)
          .map(
            (item) =>
              `- **[Routine]** ${item.subject} (${item.category}, ${item.accountLabel})`,
          )
          .join('\n')
      : '- **[Routine]** No additional maintenance items.';

  const tableRows = items
    .slice(0, 8)
    .map((item) => {
      const critical =
        item.category === 'action_required'
          ? item.subject
          : 'None';
      const noise =
        item.category === 'ignore' || item.category === 'fyi' ? 'Low signal' : 'Active';
      return `| ${item.accountLabel} | ${critical} | ${noise} |`;
    })
    .join('\n');

  return `### CRIME BULLETIN
${sitrep}

### ACTION ITEMS & PRIORITIES
${priorityLines}
${routineLines}

### SIGNAL FILTERING
| Source | Critical Alert | Noise Status |
| --- | --- | --- |
${tableRows}`;
}

async function generateExecutiveBrief({
  accountKey = null,
  triageByAccount = null,
  knowledgeBase = '',
  persist = true,
} = {}) {
  const { accounts, items } = await buildBriefingItemsLast24Hours({
    accountKey,
    triageByAccount,
  });

  if (items.length === 0) {
    const quiet = buildQuietBriefing({ accountKey });
    if (persist) {
      const stored = await appendExecutiveBrief({
        accountKey: accountKey || 'all',
        summaryText: quiet.markdown,
        urgencyLevel: quiet.urgencyLevel,
        signalCount: 0,
        mode: quiet.mode,
      });
      quiet.id = stored.id;
    }
    return quiet;
  }

  const llmResult = await callExecutiveBriefingLlm({ items, knowledgeBase });
  const urgencyLevel = inferUrgencyLevel(items);
  const stats = buildBriefingStats(items, accounts.length);
  const generatedAt = new Date().toISOString();
  const scopeKey = accountKey || 'all';

  const briefing = {
    success: true,
    quiet: false,
    message: null,
    generatedAt,
    briefingDate: generatedAt.slice(0, 10),
    markdown: llmResult.markdown,
    summaryText: llmResult.markdown,
    urgencyLevel,
    mode: llmResult.mode,
    warning: llmResult.warning ?? null,
    stats,
    accountKeys: accountKey ? [accountKey] : listAccountKeys(),
    accountKey: scopeKey,
  };

  if (persist) {
    const stored = await appendExecutiveBrief({
      accountKey: scopeKey,
      summaryText: briefing.markdown,
      urgencyLevel: briefing.urgencyLevel,
      signalCount: items.length,
      mode: briefing.mode,
    });
    briefing.id = stored.id;
  }

  return briefing;
}

/** @deprecated Use generateExecutiveBrief — kept for legacy callers. */
async function generateDailyBriefing(options = {}) {
  return generateExecutiveBrief(options);
}

async function buildBriefingItems(options = {}) {
  return buildBriefingItemsLast24Hours(options);
}

module.exports = {
  BRIEFING_WINDOW_HOURS,
  generateExecutiveBrief,
  generateDailyBriefing,
  buildBriefingItems,
  buildBriefingItemsLast24Hours,
  buildFallbackBriefing,
  buildQuietBriefing,
  formatStoredBriefing,
  inferUrgencyLevel,
};
