import AsyncStorage from '@react-native-async-storage/async-storage';
import { throwIfAiQuotaExceeded } from '../utils/relayErrors';
import type { AccountKey } from '../types/account';
import type { DailyBriefing } from '../types/briefing';
import type { TriagedNotification } from '../types/notification';
import { getActiveAccountKey, getRelayUrl } from './emailService';

const REQUEST_TIMEOUT_MS = 50_000;
const LATEST_TIMEOUT_MS = 12_000;
const DISMISS_KEY = '@shadow_inbox/briefing_dismissed_date';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
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
      throw new Error(`Briefing request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isSameBriefingDay(generatedAt: string): boolean {
  return String(generatedAt || '').slice(0, 10) === todayKey();
}

export async function fetchLatestBriefing(
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<DailyBriefing | null> {
  const params = new URLSearchParams({ accountKey });
  const response = await fetchWithTimeout(
    `${getRelayUrl()}/api/briefing/latest?${params.toString()}`,
    {
      method: 'GET',
      headers: { 'X-Account-Key': accountKey },
    },
    LATEST_TIMEOUT_MS,
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    let errorMessage = `Latest briefing request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      throwIfAiQuotaExceeded(response, body);
      if (body.error) errorMessage = body.error;
    } catch (error) {
      if (error instanceof Error && error.name === 'AiQuotaExceededError') throw error;
      const text = await response.text();
      if (text) errorMessage = text;
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as DailyBriefing;
}

export async function generateDailyBriefing(
  triageByAccount: Record<AccountKey, TriagedNotification[]>,
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<DailyBriefing> {
  const response = await fetchWithTimeout(
    `${getRelayUrl()}/api/briefing/generate`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Key': accountKey,
      },
      body: JSON.stringify({ triageByAccount, accountKey }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    let errorMessage = `Briefing request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      throwIfAiQuotaExceeded(response, body);
      if (body.error) errorMessage = body.error;
    } catch (error) {
      if (error instanceof Error && error.name === 'AiQuotaExceededError') throw error;
      const text = await response.text();
      if (text) errorMessage = text;
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as DailyBriefing;
}

export async function fetchDailyBriefing(
  triageByAccount: Record<AccountKey, TriagedNotification[]>,
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<DailyBriefing> {
  try {
    const latest = await fetchLatestBriefing(accountKey);
    if (latest && isSameBriefingDay(latest.generatedAt)) {
      return latest;
    }
  } catch (error) {
    console.warn('[Shadow Inbox] Latest briefing fetch failed, generating fresh:', error);
  }

  return generateDailyBriefing(triageByAccount, accountKey);
}

export async function isBriefingDismissedForToday(): Promise<boolean> {
  const dismissed = await AsyncStorage.getItem(DISMISS_KEY);
  return dismissed === todayKey();
}

export async function dismissBriefingForToday(): Promise<void> {
  await AsyncStorage.setItem(DISMISS_KEY, todayKey());
}

export async function clearBriefingDismissal(): Promise<void> {
  await AsyncStorage.removeItem(DISMISS_KEY);
}
