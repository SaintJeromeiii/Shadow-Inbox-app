import type { AccountKey } from '../types/account';
import type { TimelineResponse } from '../types/timeline';
import { getActiveAccountKey, getRelayUrl } from './emailService';

const REQUEST_TIMEOUT_MS = 15_000;

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
      throw new Error(`Timeline request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchTimeline(
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<TimelineResponse> {
  const params = new URLSearchParams({ accountKey });
  const response = await fetchWithTimeout(
    `${getRelayUrl()}/api/timeline?${params.toString()}`,
    {
      method: 'GET',
      headers: { 'X-Account-Key': accountKey },
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    let errorMessage = `Timeline request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) errorMessage = body.error;
    } catch {
      const text = await response.text();
      if (text) errorMessage = text;
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as TimelineResponse;
}
