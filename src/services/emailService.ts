import Constants from 'expo-constants';
import type { TriagedNotification } from '../types/notification';
import type { AccountKey } from '../types/account';
import type { ReplyTone } from '../types/replyTone';
import type { PlayerStats } from '../types/userProgress';
import type { CharacterId } from '../types/character';
import { DEFAULT_CHARACTER_ID } from '../constants/characters';

const RELAY_URL =
  process.env.EXPO_PUBLIC_EMAIL_RELAY_URL ??
  Constants.expoConfig?.extra?.emailRelayUrl ??
  'https://shadow-inbox-production.up.railway.app';
const REQUEST_TIMEOUT_MS = 15_000;

let activeAccountKey: AccountKey = 'personal';
let activeCharacterId: CharacterId = DEFAULT_CHARACTER_ID;

export function setActiveAccountKey(accountKey: AccountKey): void {
  activeAccountKey = accountKey;
}

export function getActiveAccountKey(): AccountKey {
  return activeAccountKey;
}

export function setActiveCharacterId(characterId: CharacterId): void {
  activeCharacterId = characterId;
}

export function getActiveCharacterId(): CharacterId {
  return activeCharacterId;
}

export function relayHeaders(extra?: HeadersInit): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Account-Key': activeAccountKey,
    'X-Character-Id': activeCharacterId,
    ...extra,
  };
}

export interface SendReplyPayload {
  recipient: string;
  subject: string;
  replyText: string;
}

export interface SendReplyResult {
  success: boolean;
  error?: string;
  playerStats?: PlayerStats;
}

export interface GmailActionResult {
  success: boolean;
  error?: string;
  processed?: number;
  unsupported?: string[];
  playerStats?: PlayerStats;
}

export function parseRecipientEmail(sender: string): string | null {
  const angleMatch = sender.match(/<([^>]+@[^>]+)>/);
  if (angleMatch) {
    return angleMatch[1].trim();
  }

  const emailMatch = sender.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return emailMatch?.[0] ?? null;
}

export function parseSubject(rawText: string): string {
  const match = rawText.match(/^Subject:\s*(.+)$/m);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }
  return 'Shadow Inbox Reply';
}

export function buildReplySubject(rawText: string): string {
  const original = parseSubject(rawText);
  return /^re:/i.test(original) ? original : `Re: ${original}`;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Email relay request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getRelayUrl(): string {
  return RELAY_URL.replace(/\/$/, '');
}

export function formatRelayConnectionError(error?: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const isNetworkFailure =
    /network request failed|failed to fetch|network error|timed out|abort/i.test(
      message,
    );

  if (isNetworkFailure) {
    return [
      `Cannot reach the backend at ${getRelayUrl()}.`,
      'On your phone, open that URL in Chrome (/health should return JSON).',
      'If the browser works, retry sign-in; if not, check Wi‑Fi or cellular data.',
      'Confirm EXPO_PUBLIC_EMAIL_RELAY_URL in .env, then rebuild: npx expo run:android --device',
    ].join(' ');
  }

  return message || 'Could not reach the email relay.';
}

export async function relayFetch(
  path: string,
  options: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetchWithTimeout(`${getRelayUrl()}${path}`, options, timeoutMs);
  } catch (error) {
    throw new Error(formatRelayConnectionError(error));
  }
}

export async function checkRelayHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${getRelayUrl()}/health`,
      { method: 'GET' },
      15_000,
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendReply(
  notification: TriagedNotification,
  replyText: string,
): Promise<SendReplyResult> {
  const trimmedReply = replyText.trim();
  if (!trimmedReply) {
    return { success: false, error: 'Reply text cannot be empty.' };
  }

  try {
    const response = await relayFetch('/api/replies/send', {
      method: 'POST',
      headers: relayHeaders(),
      body: JSON.stringify({
        messageId: notification.id,
        notificationId: notification.id,
        replyText: trimmedReply,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Relay returned ${response.status}`;
      try {
        const errorBody = (await response.json()) as { error?: string };
        if (errorBody.error) {
          errorMessage = errorBody.error;
        }
      } catch {
        const text = await response.text();
        if (text) errorMessage = text;
      }
      return { success: false, error: errorMessage };
    }

    const data = (await response.json()) as { playerStats?: PlayerStats };
    return { success: true, playerStats: data.playerStats };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not reach the email relay.';

    console.warn('[Shadow Inbox] Broadcast send failed:', error);
    return { success: false, error: message };
  }
}

async function postGmailAction(
  endpoint: 'archive' | 'trash',
  ids: string[],
): Promise<GmailActionResult> {
  if (ids.length === 0) {
    return { success: false, error: 'No email IDs provided.' };
  }

  try {
    const response = await fetchWithTimeout(
      `${getRelayUrl()}/api/emails/${endpoint}`,
      {
        method: 'POST',
        headers: relayHeaders(),
        body: JSON.stringify({ ids }),
      },
      REQUEST_TIMEOUT_MS,
    );

    if (!response.ok) {
      let errorMessage = `Relay returned ${response.status}`;
      try {
        const errorBody = (await response.json()) as { error?: string };
        if (errorBody.error) {
          errorMessage = errorBody.error;
        }
      } catch {
        const text = await response.text();
        if (text) errorMessage = text;
      }
      return { success: false, error: errorMessage };
    }

    const data = (await response.json()) as {
      archived?: number;
      trashed?: number;
      unsupported?: string[];
      playerStats?: PlayerStats;
    };

    return {
      success: true,
      processed: data.archived ?? data.trashed ?? ids.length,
      unsupported: data.unsupported,
      playerStats: data.playerStats,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Could not reach the email relay for ${endpoint}.`;

    console.warn(`[Shadow Inbox] Gmail ${endpoint} failed:`, error);
    return { success: false, error: message };
  }
}

export async function archiveEmails(ids: string[]): Promise<GmailActionResult> {
  return postGmailAction('archive', ids);
}

export async function trashEmails(ids: string[]): Promise<GmailActionResult> {
  return postGmailAction('trash', ids);
}

export async function syncShadowLabels(
  notifications: TriagedNotification[],
): Promise<{ success: boolean; updated?: TriagedNotification[]; error?: string }> {
  const payload = notifications
    .filter((item) => item.triage)
    .map((item) => ({
      id: item.id,
      triage: item.triage,
      messageIdHeader: item.messageIdHeader,
      gmailMessageId: item.gmailMessageId,
      shadowLabels: item.shadowLabels,
    }));

  if (payload.length === 0) {
    return { success: true, updated: [] };
  }

  try {
    const response = await fetchWithTimeout(
      `${getRelayUrl()}/api/emails/sync-labels`,
      {
        method: 'POST',
        headers: relayHeaders(),
        body: JSON.stringify({ notifications: payload }),
      },
      REQUEST_TIMEOUT_MS,
    );

    if (!response.ok) {
      let errorMessage = `Relay returned ${response.status}`;
      try {
        const errorBody = (await response.json()) as { error?: string };
        if (errorBody.error) errorMessage = errorBody.error;
      } catch {
        const text = await response.text();
        if (text) errorMessage = text;
      }
      return { success: false, error: errorMessage };
    }

    const data = (await response.json()) as {
      notifications?: TriagedNotification[];
    };

    return {
      success: true,
      updated: data.notifications ?? [],
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not sync Gmail labels with the relay.',
    };
  }
}

export interface RedraftReplyPayload {
  emailId: string;
  originalMessage: string;
  currentDraft: string;
  tone: ReplyTone;
}

export interface RedraftReplyResult {
  success: boolean;
  draft?: string;
  tone?: ReplyTone;
  mode?: 'template' | 'live' | 'fallback';
  error?: string;
}

const REDRAFT_TIMEOUT_MS = 30_000;

export async function redraftEmailReply(
  payload: RedraftReplyPayload,
): Promise<RedraftReplyResult> {
  try {
    const response = await fetchWithTimeout(
      `${getRelayUrl()}/api/emails/redraft`,
      {
        method: 'POST',
        headers: relayHeaders(),
        body: JSON.stringify({
          emailId: payload.emailId,
          originalMessage: payload.originalMessage,
          currentDraft: payload.currentDraft,
          tone: payload.tone,
        }),
      },
      REDRAFT_TIMEOUT_MS,
    );

    if (!response.ok) {
      let errorMessage = `Relay returned ${response.status}`;
      try {
        const errorBody = (await response.json()) as { error?: string };
        if (errorBody.error) errorMessage = errorBody.error;
      } catch {
        const text = await response.text();
        if (text) errorMessage = text;
      }
      return { success: false, error: errorMessage };
    }

    const data = (await response.json()) as {
      draft?: string;
      tone?: ReplyTone;
      mode?: RedraftReplyResult['mode'];
    };

    if (!data.draft?.trim()) {
      return { success: false, error: 'Redraft returned an empty reply.' };
    }

    return {
      success: true,
      draft: data.draft,
      tone: data.tone,
      mode: data.mode,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not redraft reply with the relay.',
    };
  }
}
