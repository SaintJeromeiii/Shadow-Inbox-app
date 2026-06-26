const { listAccounts, listAccountKeys } = require('./accounts');
const { readNotifications } = require('./notificationFeed');

const REQUEST_TIMEOUT_MS = 45_000;

const BRIEFING_SYSTEM_PROMPT = `You are a world-class executive assistant preparing Jerome's Smart Morning Briefing.

Jerome is a program analyst and app builder juggling federal resource management and three active apps: ServiceLog, DealShield, and AlphaRounds (closed beta / Google Play tester recruitment).

Your job: synthesize today's inbox into a highly scannable executive briefing in markdown. Be ruthless about brevity — Jerome reads this on his phone in under 60 seconds.

Output format (use exactly these section headers):

## Top Priorities
- Bullet the 3–5 most urgent items across all inboxes. Lead with deadlines, blockers, and leadership asks.
- Include account label in parentheses when helpful, e.g. "(Work)" or "(Personal)".

## Testers & App Feedback
- Surface anything related to ServiceLog, DealShield, AlphaRounds, beta testing, Google Play Console, tester recruitment, or app feedback.
- If none found, write: "- No tester or app feedback emails today."

## Quick Wins
- List emails that can be instantly cleared: FYI items, newsletters already triaged as ignore, low-urgency acknowledgments, or one-tap archive candidates.
- Keep to 3–6 bullets max.

Rules:
- Use markdown bullets only (lines starting with "- ").
- No preamble, no sign-off, no "Good morning" fluff.
- Reference specific senders or subjects when it adds clarity.
- Respect triage classifications provided — prioritize action_required, deprioritize ignore.
- If the inbox is empty or all untriaged, say so plainly and suggest running Process Feed.`;

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

function isToday(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  return date.toDateString() === now.toDateString();
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

async function buildBriefingItems({ triageByAccount = null } = {}) {
  const accounts = listAccounts();
  const items = [];

  for (const account of accounts) {
    const rawNotifications = await readNotifications(account.key);
    const overlay = triageByAccount?.[account.key];
    const notifications = mergeTriageOverlay(rawNotifications, overlay);

    for (const notification of notifications) {
      if (notification.archived) continue;
      if (!isToday(notification.timestamp)) continue;

      items.push({
        accountKey: account.key,
        accountLabel: account.label,
        id: notification.id,
        sender: notification.sender,
        subject: extractSubject(notification.rawText),
        category: notification.triage?.category ?? 'untriaged',
        summary:
          notification.triage?.cleanSummary ??
          String(notification.rawText || '').slice(0, 160),
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

function buildFallbackBriefing(items) {
  const actionRequired = items.filter((item) => item.category === 'action_required');
  const quickWins = items.filter(
    (item) => item.category === 'fyi' || item.category === 'ignore',
  );
  const appRelated = items.filter((item) =>
    /servicelog|dealshield|alpharounds|beta|tester|play console|google play/i.test(
      `${item.subject} ${item.summary} ${item.sender}`,
    ),
  );

  const priorityLines =
    actionRequired.length > 0
      ? actionRequired
          .slice(0, 5)
          .map(
            (item) =>
              `- **${item.subject}** from ${item.sender} (${item.accountLabel})`,
          )
          .join('\n')
      : '- No triaged action items yet — run **Process Feed** to classify today\'s mail.';

  const appLines =
    appRelated.length > 0
      ? appRelated
          .map(
            (item) =>
              `- ${item.subject} — ${item.summary} (${item.accountLabel})`,
          )
          .join('\n')
      : '- No tester or app feedback emails today.';

  const quickWinLines =
    quickWins.length > 0
      ? quickWins
          .slice(0, 6)
          .map((item) => `- ${item.subject} (${item.category}, ${item.accountLabel})`)
          .join('\n')
      : '- Process your inbox to surface clearable items.';

  return `## Top Priorities
${priorityLines}

## Testers & App Feedback
${appLines}

## Quick Wins
${quickWinLines}`;
}

async function callBriefingLlm({ items, knowledgeBase }) {
  const { apiKey, apiUrl, model } = getOpenAiConfig();

  if (isPlaceholderApiKey(apiKey)) {
    return {
      markdown: buildFallbackBriefing(items),
      mode: 'fallback',
      warning: 'OpenAI API key missing — using local briefing summary.',
    };
  }

  const userPayload = {
    briefingDate: new Date().toISOString().slice(0, 10),
    emailCount: items.length,
    emails: items,
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
        temperature: 0.35,
        messages: [
          {
            role: 'system',
            content: `${BRIEFING_SYSTEM_PROMPT}\n\nJerome's persona & context:\n"""\n${knowledgeBase}\n"""`,
          },
          {
            role: 'user',
            content: `Generate today's Smart Morning Briefing from this combined inbox data:\n\n${JSON.stringify(userPayload, null, 2)}`,
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

async function generateDailyBriefing({ triageByAccount = null, knowledgeBase = '' } = {}) {
  const { accounts, items } = await buildBriefingItems({ triageByAccount });
  const llmResult = await callBriefingLlm({ items, knowledgeBase });

  const stats = {
    totalToday: items.length,
    actionRequired: items.filter((item) => item.category === 'action_required')
      .length,
    fyi: items.filter((item) => item.category === 'fyi').length,
    ignore: items.filter((item) => item.category === 'ignore').length,
    untriaged: items.filter((item) => item.category === 'untriaged').length,
    accountCount: accounts.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    briefingDate: new Date().toISOString().slice(0, 10),
    markdown: llmResult.markdown,
    mode: llmResult.mode,
    warning: llmResult.warning ?? null,
    stats,
    accountKeys: listAccountKeys(),
  };
}

module.exports = {
  generateDailyBriefing,
  buildBriefingItems,
  buildFallbackBriefing,
};
