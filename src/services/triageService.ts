import type { RawNotification, TriageResult, TriageCategory } from '../types/notification';
import { relayFetch, relayHeaders } from './emailService';

export { getSeedNotifications, getNotificationDataSource } from './notificationData';

const REQUEST_TIMEOUT_MS = 65_000;
const BATCH_CHUNK_SIZE = 25;

const VALID_CATEGORIES: TriageCategory[] = ['action_required', 'fyi', 'ignore'];

export type TriageMode = 'live' | 'simulation';

let cachedTriageMode: TriageMode | null = null;

export async function refreshTriageMode(): Promise<TriageMode> {
  try {
    const response = await relayFetch('/api/triage/status', {
      method: 'GET',
      headers: relayHeaders(),
    }, 8_000);

    if (!response.ok) {
      cachedTriageMode = 'simulation';
      return cachedTriageMode;
    }

    const data = (await response.json()) as { mode?: TriageMode };
    cachedTriageMode = data.mode === 'live' ? 'live' : 'simulation';
    return cachedTriageMode;
  } catch {
    cachedTriageMode = 'simulation';
    return cachedTriageMode;
  }
}

export function getTriageMode(): TriageMode {
  return cachedTriageMode ?? 'simulation';
}

export function isLlmConfigured(): boolean {
  return getTriageMode() === 'live';
}

function shouldForceActionRequired(notification: RawNotification): boolean {
  const text = notification.rawText;
  const lower = text.toLowerCase();

  if (/\btest\b/i.test(text)) {
    return true;
  }

  return /action required|todo|task|please respond|needs review|blocking|asap|urgent|follow[- ]?up|waiting on you|need your input|reply needed/.test(
    lower,
  );
}

function draftReply(notification: RawNotification): string {
  const text = notification.rawText.toLowerCase();

  if (text.includes('review') || text.includes('pr #')) {
    return "On it — I'll review this today and leave comments.";
  }
  if (text.includes('confirm') || text.includes('rsvp')) {
    return "Confirmed — I'll follow up with details shortly.";
  }
  if (text.includes('test')) {
    return "Received — I'll complete this and confirm shortly.";
  }

  return "Noted — I'll handle this and follow up today.";
}

function summarizeLocally(notification: RawNotification, fallback?: string): string {
  const firstLine = notification.rawText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return fallback ?? 'New notification received.';
  const cleaned = firstLine.replace(/\*\*/g, '').slice(0, 120);
  return cleaned.length < firstLine.length ? `${cleaned}…` : cleaned;
}

function simulateTriage(notification: RawNotification): TriageResult {
  if (shouldForceActionRequired(notification)) {
    return {
      category: 'action_required',
      cleanSummary: summarizeLocally(notification),
      suggestedReply: draftReply(notification),
      urgencyScore: /\btest\b/i.test(notification.rawText) ? 8 : 7,
    };
  }

  const text = notification.rawText.toLowerCase();
  const sender = notification.sender.toLowerCase();

  const isVerification =
    /verification code|your code is|\b\d{6}\b/.test(text) &&
    (sender.includes('noreply') || sender.includes('unknown'));
  const isSpam =
    /reply stop|unsubscribe|newsletter|promo|sale ends/.test(text) &&
    !text.includes('action');

  if (isVerification || isSpam) {
    return {
      category: 'ignore',
      cleanSummary: summarizeLocally(notification, 'Automated or low-priority message.'),
      suggestedReply: null,
      urgencyScore: 1,
    };
  }

  const needsAction =
    /action required|can you review|blocking|eod|please respond/.test(text);

  if (needsAction) {
    return {
      category: 'action_required',
      cleanSummary: summarizeLocally(notification),
      suggestedReply: draftReply(notification),
      urgencyScore: text.includes('blocking') || text.includes('eod') ? 9 : 7,
    };
  }

  return {
    category: 'fyi',
    cleanSummary: summarizeLocally(notification),
    suggestedReply: null,
    urgencyScore: 2,
  };
}

async function triageBatchOnServer(
  notifications: RawNotification[],
): Promise<Map<string, TriageResult>> {
  const response = await relayFetch(
    '/api/triage/batch',
    {
      method: 'POST',
      headers: relayHeaders(),
      body: JSON.stringify({ notifications }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      usage?: { used: number; limit: number; remaining: number };
    };
    if (response.status === 429) {
      const error = new Error(body.error ?? 'Daily triage limit reached.');
      (error as Error & { code?: string }).code = 'TRIAGE_LIMIT_EXCEEDED';
      throw error;
    }
    throw new Error(body.error ?? `Triage failed (${response.status})`);
  }

  const data = (await response.json()) as {
    mode?: TriageMode;
    results?: Record<string, TriageResult>;
  };

  if (data.mode) {
    cachedTriageMode = data.mode;
  }

  const results = new Map<string, TriageResult>();
  for (const [id, triage] of Object.entries(data.results ?? {})) {
    if (triage?.category && VALID_CATEGORIES.includes(triage.category)) {
      results.set(id, triage);
    }
  }

  return results;
}

export async function triageNotification(
  notification: RawNotification,
): Promise<TriageResult> {
  try {
    const results = await triageBatchOnServer([notification]);
    const triage = results.get(notification.id);
    if (triage) {
      return triage;
    }
  } catch (error) {
    console.warn('[Shadow Inbox] Server triage failed, using simulation:', error);
  }

  return simulateTriage(notification);
}

export async function triageNotifications(
  notifications: RawNotification[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, TriageResult>> {
  const results = new Map<string, TriageResult>();
  const total = notifications.length;

  for (let offset = 0; offset < notifications.length; offset += BATCH_CHUNK_SIZE) {
    const chunk = notifications.slice(offset, offset + BATCH_CHUNK_SIZE);

    try {
      const chunkResults = await triageBatchOnServer(chunk);
      for (const [id, triage] of chunkResults.entries()) {
        results.set(id, triage);
      }
      } catch (error) {
        const isLimit =
          error instanceof Error &&
          (error as Error & { code?: string }).code === 'TRIAGE_LIMIT_EXCEEDED';
        console.warn(
          isLimit
            ? '[Shadow Inbox] Daily triage limit reached; using simulation for remaining chunk.'
            : '[Shadow Inbox] Server batch triage failed, simulating chunk:',
          error,
        );
      for (const notification of chunk) {
        results.set(notification.id, simulateTriage(notification));
      }
    }

    onProgress?.(Math.min(offset + chunk.length, total), total);
  }

  return results;
}

void refreshTriageMode();
