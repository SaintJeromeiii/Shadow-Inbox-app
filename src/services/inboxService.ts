import type { RawNotification } from '../types/notification';
import type { AccountKey } from '../types/account';
import { getRelayUrl } from './emailService';

const REQUEST_TIMEOUT_MS = 20_000;
const SYNC_REQUEST_TIMEOUT_MS = 65_000;

export interface InboxFetchResult {
  accountKey: AccountKey;
  notifications: RawNotification[];
  synced: boolean;
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
      throw new Error(`Inbox request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchInboxFromRelay(
  accountKey: AccountKey,
  sync = false,
): Promise<InboxFetchResult> {
  const url = `${getRelayUrl()}/api/emails?sync=${sync ? 'true' : 'false'}`;

  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: {
        'X-Account-Key': accountKey,
      },
    },
    sync ? SYNC_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    let errorMessage = `Relay returned ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) errorMessage = body.error;
    } catch {
      const text = await response.text();
      if (text) errorMessage = text;
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    accountKey: AccountKey;
    notifications: RawNotification[];
    synced?: boolean;
  };

  return {
    accountKey: data.accountKey,
    notifications: data.notifications ?? [],
    synced: Boolean(data.synced),
  };
}
