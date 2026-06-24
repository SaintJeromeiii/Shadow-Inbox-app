import type { TriagedNotification } from '../types/notification';

const RELAY_URL =
  process.env.EXPO_PUBLIC_EMAIL_RELAY_URL ?? 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 15_000;

export interface SendReplyPayload {
  recipient: string;
  subject: string;
  replyText: string;
}

export interface SendReplyResult {
  success: boolean;
  error?: string;
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

export async function checkRelayHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${getRelayUrl()}/health`,
      { method: 'GET' },
      5000,
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

  if (notification.sourceApp !== 'Email') {
    return {
      success: false,
      error: 'SMTP send is only supported for email notifications.',
    };
  }

  const recipient = parseRecipientEmail(notification.sender);
  if (!recipient) {
    return {
      success: false,
      error: 'Could not parse a recipient email from this notification.',
    };
  }

  const payload: SendReplyPayload = {
    recipient,
    subject: buildReplySubject(notification.rawText),
    replyText: trimmedReply,
  };

  try {
    const response = await fetchWithTimeout(
      `${getRelayUrl()}/send-reply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

    return { success: true };
  } catch (error) {
    const isNetworkError =
      error instanceof TypeError ||
      (error instanceof Error &&
        /network request failed|failed to fetch|network error/i.test(error.message));

    let message =
      error instanceof Error
        ? error.message
        : 'Could not reach the email relay.';

    if (isNetworkError) {
      message = [
        `Cannot reach email relay at ${getRelayUrl()}.`,
        'On your phone: confirm EXPO_PUBLIC_EMAIL_RELAY_URL uses your Mac\'s LAN IP (not localhost),',
        'npm run dev:backend is running, and phone + Mac are on the same Wi‑Fi.',
        'Then restart Expo with: npx expo start -c',
      ].join(' ');
    }

    console.warn('[Shadow Inbox] Email send failed:', error);
    return { success: false, error: message };
  }
}
