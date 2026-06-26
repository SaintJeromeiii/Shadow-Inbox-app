const { listPrimaryEvents } = require('./calendarApi');

const DEFAULT_TIMEZONE =
  process.env.CALENDAR_TIMEZONE || process.env.TZ || 'America/Los_Angeles';

function eventsOverlap(eventStart, eventEnd, windowStart, windowEnd) {
  const start = new Date(eventStart).getTime();
  const end = new Date(eventEnd).getTime();
  const rangeStart = new Date(windowStart).getTime();
  const rangeEnd = new Date(windowEnd).getTime();
  return start < rangeEnd && end > rangeStart;
}

function formatSlotLabel(start, end, timeZone = DEFAULT_TIMEZONE) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone,
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });

  const sameDay =
    startDate.toLocaleDateString('en-US', { timeZone }) ===
    endDate.toLocaleDateString('en-US', { timeZone });

  if (sameDay) {
    return `${dayFormatter.format(startDate)} at ${timeFormatter.format(startDate)}`;
  }

  return `${dayFormatter.format(startDate)} ${timeFormatter.format(startDate)} – ${timeFormatter.format(endDate)}`;
}

/**
 * Sweep the user's primary calendar for events overlapping [startDateTime, endDateTime].
 */
async function checkAvailability(accountKey, startDateTime, endDateTime) {
  const windowStart = new Date(startDateTime);
  const windowEnd = new Date(endDateTime);

  if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime())) {
    throw new Error('Invalid start or end datetime for calendar availability check.');
  }

  if (windowEnd <= windowStart) {
    throw new Error('endDateTime must be after startDateTime.');
  }

  const events = await listPrimaryEvents(accountKey, {
    timeMin: windowStart.toISOString(),
    timeMax: windowEnd.toISOString(),
    maxResults: 25,
  });

  const conflictingEvents = events.filter((event) =>
    eventsOverlap(event.start, event.end, windowStart, windowEnd),
  );

  return {
    isFree: conflictingEvents.length === 0,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    conflictingEvents,
    eventsInWindow: events,
  };
}

/**
 * Return up to `limit` events immediately before/after the proposed window.
 */
async function getSurroundingEvents(
  accountKey,
  startDateTime,
  endDateTime,
  limit = 2,
) {
  const centerStart = new Date(startDateTime);
  const centerEnd = new Date(endDateTime);
  const padMs = 6 * 60 * 60 * 1000;

  const events = await listPrimaryEvents(accountKey, {
    timeMin: new Date(centerStart.getTime() - padMs).toISOString(),
    timeMax: new Date(centerEnd.getTime() + padMs).toISOString(),
    maxResults: 20,
  });

  const before = events
    .filter((event) => new Date(event.end).getTime() <= centerStart.getTime())
    .slice(-1);
  const after = events
    .filter((event) => new Date(event.start).getTime() >= centerEnd.getTime())
    .slice(0, 1);

  const surrounding = [...before, ...after];
  if (surrounding.length >= limit) {
    return surrounding.slice(0, limit);
  }

  const remaining = limit - surrounding.length;
  const fillers = events
    .filter(
      (event) =>
        !surrounding.some((item) => item.id === event.id) &&
        eventsOverlap(
          event.start,
          event.end,
          new Date(centerStart.getTime() - padMs),
          new Date(centerEnd.getTime() + padMs),
        ),
    )
    .slice(0, remaining);

  return [...surrounding, ...fillers].slice(0, limit);
}

function setLocalTime(baseDate, hours, minutes, timeZone = DEFAULT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(baseDate);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const localIso = `${year}-${month}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  return new Date(localIso);
}

/**
 * Find open blocks in primary calendar over the next few business days.
 */
async function findAlternativeSlots(
  accountKey,
  {
    durationMinutes = 60,
    searchStart = new Date(),
    searchDays = 5,
    maxSlots = 3,
    businessStartHour = 9,
    businessEndHour = 17,
  } = {},
) {
  const slots = [];
  const durationMs = durationMinutes * 60 * 1000;
  const cursor = new Date(searchStart);
  cursor.setMinutes(0, 0, 0);

  for (let day = 0; day < searchDays && slots.length < maxSlots; day += 1) {
    const dayStart = setLocalTime(cursor, businessStartHour, 0);
    const dayEnd = setLocalTime(cursor, businessEndHour, 0);

    let events = [];
    try {
      events = await listPrimaryEvents(accountKey, {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        maxResults: 40,
      });
    } catch {
      break;
    }

    let slotStart = new Date(Math.max(dayStart.getTime(), cursor.getTime()));
    if (slotStart.getMinutes() % 30 !== 0) {
      slotStart = new Date(slotStart.getTime() + (30 - (slotStart.getMinutes() % 30)) * 60 * 1000);
    }

    while (slotStart.getTime() + durationMs <= dayEnd.getTime() && slots.length < maxSlots) {
      const slotEnd = new Date(slotStart.getTime() + durationMs);
      const conflict = events.some((event) =>
        eventsOverlap(event.start, event.end, slotStart, slotEnd),
      );

      if (!conflict && slotStart.getTime() >= Date.now()) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: formatSlotLabel(slotStart, slotEnd),
        });
      }

      slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000);
    }

    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }

  return slots;
}

module.exports = {
  DEFAULT_TIMEZONE,
  checkAvailability,
  getSurroundingEvents,
  findAlternativeSlots,
  formatSlotLabel,
  eventsOverlap,
};
