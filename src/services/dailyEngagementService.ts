import { relayFetch, relayHeaders } from './emailService';

export interface DailyEngagement {
  dailyGoal: number;
  clearsToday: number;
  streakDays: number;
  lastClearDate: string | null;
  goalMet: boolean;
  progress: number;
}

export async function fetchDailyEngagement(): Promise<DailyEngagement> {
  const response = await relayFetch('/api/user/engagement', {
    method: 'GET',
    headers: relayHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to load daily engagement (${response.status})`);
  }

  const data = (await response.json()) as { engagement?: DailyEngagement };
  return (
    data.engagement ?? {
      dailyGoal: 10,
      clearsToday: 0,
      streakDays: 0,
      lastClearDate: null,
      goalMet: false,
      progress: 0,
    }
  );
}

export async function recordDailyClearance(count = 1): Promise<DailyEngagement> {
  const response = await relayFetch('/api/user/engagement/clear', {
    method: 'POST',
    headers: relayHeaders(),
    body: JSON.stringify({ count }),
  });

  if (!response.ok) {
    throw new Error(`Failed to record clearance (${response.status})`);
  }

  const data = (await response.json()) as { engagement?: DailyEngagement };
  return (
    data.engagement ?? {
      dailyGoal: 10,
      clearsToday: count,
      streakDays: 1,
      lastClearDate: new Date().toISOString().slice(0, 10),
      goalMet: false,
      progress: 0,
    }
  );
}
