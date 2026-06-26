import type { AccountKey } from '../types/account';
import type { FinanceSummary } from '../types/finance';
import { getRelayUrl } from './emailService';

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
      throw new Error(`Finance request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchFinanceSummary(
  accountKey?: AccountKey,
): Promise<FinanceSummary> {
  const params = new URLSearchParams();
  if (accountKey) params.set('accountKey', accountKey);

  const query = params.toString();
  const response = await fetchWithTimeout(
    `${getRelayUrl()}/api/finances/summary${query ? `?${query}` : ''}`,
    {
      method: 'GET',
      headers: accountKey ? { 'X-Account-Key': accountKey } : undefined,
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    let errorMessage = `Relay returned ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) errorMessage = body.error;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as FinanceSummary;
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
