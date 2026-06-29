import type { AccountKey } from '../types/account';
import type { QuickReplyGenerateResult } from '../types/quickReply';
import { getActiveAccountKey, relayFetch } from './emailService';

const REQUEST_TIMEOUT_MS = 45_000;

async function parseRelayJson<T extends { error?: string }>(
  response: Response,
): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) {
      throw new Error(`Relay error (${response.status})`);
    }
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      response.ok
        ? 'Relay returned a non-JSON response.'
        : `Relay error (${response.status})`,
    );
  }
}

export async function generateQuickReplies(
  input: { messageId: string; context?: string },
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<QuickReplyGenerateResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await relayFetch('/api/replies/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Key': accountKey,
      },
      body: JSON.stringify({
        messageId: input.messageId,
        context: input.context,
        accountKey,
      }),
      signal: controller.signal,
    });

    const data = await parseRelayJson<QuickReplyGenerateResult & { error?: string }>(
      response,
    );

    if (!response.ok) {
      throw new Error(data.error ?? `Quick reply generation failed (${response.status})`);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendQuickReply(
  messageId: string,
  replyText: string,
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<{ success: boolean; error?: string }> {
  const response = await relayFetch('/api/replies/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Account-Key': accountKey,
    },
    body: JSON.stringify({
      messageId,
      replyText,
      accountKey,
    }),
  });

  const data = await parseRelayJson<{ success?: boolean; error?: string }>(response);

  if (!response.ok || !data.success) {
    return {
      success: false,
      error: data.error ?? `Send reply failed (${response.status})`,
    };
  }

  return { success: true };
}
