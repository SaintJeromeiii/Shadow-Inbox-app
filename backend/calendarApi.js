const { getAccount, resolveAccountKey } = require('./accounts');
const { getValidAccessToken } = require('./googleOAuth');

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

async function calendarApiRequest(accountKey, path, options = {}) {
  const account = getAccount(resolveAccountKey(accountKey));
  if (!account?.oauth) {
    throw new Error(`Google Calendar is only available for linked Google accounts (${accountKey}).`);
  }

  const accessToken = await getValidAccessToken(accountKey);
  const response = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error ||
      `Calendar API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }

  return payload;
}

function normalizeEvent(event) {
  const startRaw = event.start?.dateTime || event.start?.date;
  const endRaw = event.end?.dateTime || event.end?.date;
  if (!startRaw || !endRaw) return null;

  return {
    id: event.id,
    title: event.summary || '(No title)',
    start: new Date(startRaw).toISOString(),
    end: new Date(endRaw).toISOString(),
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
  };
}

async function listPrimaryEvents(accountKey, { timeMin, timeMax, maxResults = 50 }) {
  const params = new URLSearchParams({
    timeMin: new Date(timeMin).toISOString(),
    timeMax: new Date(timeMax).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
  });

  const payload = await calendarApiRequest(
    accountKey,
    `/calendars/primary/events?${params.toString()}`,
  );

  return (payload.items || [])
    .map(normalizeEvent)
    .filter(Boolean);
}

module.exports = {
  calendarApiRequest,
  listPrimaryEvents,
  normalizeEvent,
};
