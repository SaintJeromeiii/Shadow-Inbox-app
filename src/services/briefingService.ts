import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccountKey } from '../types/account';
import type { DailyBriefing } from '../types/briefing';
import type { TriagedNotification } from '../types/notification';
import { getRelayUrl } from './emailService';

const REQUEST_TIMEOUT_MS = 50_000;
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

export async function fetchDailyBriefing(
  triageByAccount: Record<AccountKey, TriagedNotification[]>,
): Promise<DailyBriefing> {
  const response = await fetchWithTimeout(
    `${getRelayUrl()}/api/briefing`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triageByAccount }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    let errorMessage = `Briefing request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) errorMessage = body.error;
    } catch {
      const text = await response.text();
      if (text) errorMessage = text;
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as DailyBriefing;
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
