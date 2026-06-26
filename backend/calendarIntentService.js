const {
  checkAvailability,
  getSurroundingEvents,
  findAlternativeSlots,
  formatSlotLabel,
  DEFAULT_TIMEZONE,
} = require('./calendarService');

const API_KEY =
  process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const API_URL =
  process.env.LLM_API_URL ||
  process.env.EXPO_PUBLIC_LLM_API_URL ||
  'https://api.openai.com/v1/chat/completions';
const MODEL =
  process.env.LLM_MODEL || process.env.EXPO_PUBLIC_LLM_MODEL || 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 20_000;

const SCHEDULING_PATTERN =
  /\b(meet|meeting|schedule|calendar|availability|available|free (at|on|this)|are you free|can we (meet|chat|call)|let'?s (meet|sync|chat)|call at|zoom|teams invite|coffee|catch up|next (monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)|this (morning|afternoon|evening)|tomorrow|at \d{1,2}(:\d{2})?\s?(am|pm)?)\b/i;

function hasSchedulingKeywords(text) {
  return SCHEDULING_PATTERN.test(String(text || ''));
}

function extractSubject(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

function fallbackParseSchedulingWindow(notification) {
  const text = `${notification.rawText}\n${extractSubject(notification.rawText)}`;
  if (!hasSchedulingKeywords(text)) {
    return null;
  }

  const now = new Date();
  const lower = text.toLowerCase();
  let start = new Date(now);
  let durationMinutes = 60;

  if (/this afternoon/.test(lower)) {
    start.setHours(14, 0, 0, 0);
  } else if (/this morning/.test(lower)) {
    start.setHours(10, 0, 0, 0);
  } else if (/tomorrow/.test(lower)) {
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
  } else {
    const atMatch = lower.match(/at (\d{1,2})(?::(\d{2}))?\s?(am|pm)?/);
    if (atMatch) {
      let hours = Number(atMatch[1]);
      const minutes = Number(atMatch[2] || 0);
      const meridiem = atMatch[3];
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      start.setHours(hours, minutes, 0, 0);
      if (start.getTime() < now.getTime()) {
        start.setDate(start.getDate() + 1);
      }
    } else {
      start.setDate(start.getDate() + 1);
      start.setHours(14, 0, 0, 0);
    }
  }

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  return {
    hasSchedulingIntent: true,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    windowLabel: formatSlotLabel(start, end),
    durationMinutes,
  };
}

async function parseSchedulingWindow(notification) {
  const text = `${extractSubject(notification.rawText)}\n\n${notification.rawText}`;
  if (!hasSchedulingKeywords(text)) {
    return null;
  }

  if (!API_KEY || API_KEY.includes('your_')) {
    return fallbackParseSchedulingWindow(notification);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You detect scheduling intent in emails for Jerome (${DEFAULT_TIMEZONE}).
Return ONLY JSON:
{
  "hasSchedulingIntent": boolean,
  "startIso": "ISO-8601 datetime with offset or Z",
  "endIso": "ISO-8601 datetime with offset or Z",
  "windowLabel": "human label like Friday at 2:00 PM",
  "durationMinutes": number
}

Rules:
- Set hasSchedulingIntent true only when the sender proposes or asks about a specific meeting time/window.
- Resolve relative phrases ("next Tuesday", "this afternoon", "are you free at 3?") against email timestamp: ${notification.timestamp}.
- Default meeting length: 60 minutes unless the email states otherwise.
- If no concrete window can be inferred, set hasSchedulingIntent false.`,
          },
          {
            role: 'user',
            content: `Email timestamp: ${notification.timestamp}\nFrom: ${notification.sender}\n\n${text}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Scheduling parse failed.');
    }

    const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
    if (!parsed.hasSchedulingIntent || !parsed.startIso || !parsed.endIso) {
      return null;
    }

    return {
      hasSchedulingIntent: true,
      startIso: new Date(parsed.startIso).toISOString(),
      endIso: new Date(parsed.endIso).toISOString(),
      windowLabel: String(parsed.windowLabel || formatSlotLabel(parsed.startIso, parsed.endIso)).trim(),
      durationMinutes: Number(parsed.durationMinutes) || 60,
    };
  } catch (error) {
    console.warn('[CalendarIntent] LLM parse failed, using fallback:', error.message);
    return fallbackParseSchedulingWindow(notification);
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildCalendarPromptBlock(guard) {
  if (!guard?.checked) return '';

  const lines = ['--- CALENDAR AVAILABILITY ---'];

  if (guard.status === 'unavailable') {
    lines.push('Calendar API unavailable — do not claim specific free/busy facts.');
    return lines.join('\n');
  }

  lines.push(`Proposed window: ${guard.proposedWindow?.label || 'Unknown'}`);
  lines.push(guard.isFree ? 'STATUS: FREE — Jerome is open for this slot.' : 'STATUS: CONFLICT — Jerome is NOT free.');

  if (!guard.isFree && guard.conflictEvent) {
    lines.push(
      `Conflicts with: "${guard.conflictEvent.title}" (${guard.conflictEvent.start} – ${guard.conflictEvent.end}).`,
    );
  }

  if (guard.surroundingEvents?.length) {
    lines.push('Nearby appointments:');
    for (const event of guard.surroundingEvents) {
      lines.push(`- ${event.title}: ${event.start} – ${event.end}`);
    }
  }

  if (!guard.isFree && guard.alternativeSlots?.length) {
    lines.push('Alternative open blocks Jerome can offer:');
    for (const slot of guard.alternativeSlots) {
      lines.push(`- ${slot.label}`);
    }
    lines.push(
      'Draft a polite reply that declines the conflicting time and proposes 1-2 of the alternative open blocks.',
    );
  } else if (guard.isFree) {
    lines.push(
      'Draft a concise acceptance that confirms the proposed time and expresses readiness to meet.',
    );
  }

  return lines.join('\n');
}

function applyCalendarGuard(notification, guard) {
  if (!guard) return notification;
  return {
    ...notification,
    calendarGuard: guard,
  };
}

async function auditCalendarForEmail(accountKey, notification) {
  const parsed = await parseSchedulingWindow(notification);
  if (!parsed?.hasSchedulingIntent) {
    return { guard: null, promptBlock: '' };
  }

  const durationMinutes = Math.max(
    15,
    Math.round(
      (new Date(parsed.endIso).getTime() - new Date(parsed.startIso).getTime()) / 60000,
    ) || parsed.durationMinutes || 60,
  );

  try {
    const availability = await checkAvailability(
      accountKey,
      parsed.startIso,
      parsed.endIso,
    );
    const surroundingEvents = await getSurroundingEvents(
      accountKey,
      parsed.startIso,
      parsed.endIso,
      2,
    );

    let alternativeSlots = [];
    if (!availability.isFree) {
      alternativeSlots = await findAlternativeSlots(accountKey, {
        durationMinutes,
        searchStart: new Date(parsed.endIso),
        searchDays: 7,
        maxSlots: 3,
      });
    }

    const conflictEvent = availability.conflictingEvents[0] || null;
    const guard = {
      checked: true,
      status: availability.isFree ? 'clear' : 'conflict',
      isFree: availability.isFree,
      proposedWindow: {
        label: parsed.windowLabel,
        start: parsed.startIso,
        end: parsed.endIso,
      },
      conflictEvent: conflictEvent
        ? {
            title: conflictEvent.title,
            start: conflictEvent.start,
            end: conflictEvent.end,
          }
        : null,
      surroundingEvents: surroundingEvents.map((event) => ({
        title: event.title,
        start: event.start,
        end: event.end,
      })),
      alternativeSlots,
      badgeMessage: availability.isFree
        ? `Calendar Clear: ${parsed.windowLabel} is open`
        : `Schedule Conflict: Overlaps with ${conflictEvent?.title || 'another event'}`,
    };

    return {
      guard,
      promptBlock: buildCalendarPromptBlock(guard),
    };
  } catch (error) {
    const needsScope =
      error.status === 403 ||
      /insufficient|scope|permission|denied/i.test(error.message || '');

    console.warn(
      `[CalendarIntent] Availability check failed for ${notification.id}:`,
      error.message,
    );

    const guard = {
      checked: true,
      status: 'unavailable',
      isFree: null,
      proposedWindow: {
        label: parsed.windowLabel,
        start: parsed.startIso,
        end: parsed.endIso,
      },
      conflictEvent: null,
      surroundingEvents: [],
      alternativeSlots: [],
      badgeMessage: needsScope
        ? 'Calendar Guard: Re-link Google account with Calendar access'
        : `Scheduling detected: ${parsed.windowLabel}`,
      error: error.message,
      needsCalendarScope: needsScope,
    };

    return {
      guard,
      promptBlock: buildCalendarPromptBlock(guard),
    };
  }
}

module.exports = {
  hasSchedulingKeywords,
  parseSchedulingWindow,
  auditCalendarForEmail,
  buildCalendarPromptBlock,
  applyCalendarGuard,
};
