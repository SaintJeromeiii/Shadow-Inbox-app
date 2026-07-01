import { relayFetch, relayHeaders } from './emailService';

export interface AiUsageBucket {
  used: number;
  limit: number;
  remaining: number;
}

export interface AiUsageSummary {
  accountKey: string;
  exempt: boolean;
  date: string;
  triage: AiUsageBucket;
  llm: AiUsageBucket;
  embedding: AiUsageBucket;
}

export async function fetchAiUsage(): Promise<AiUsageSummary | null> {
  try {
    const response = await relayFetch('/api/user/ai-usage', {
      method: 'GET',
      headers: relayHeaders(),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { usage?: AiUsageSummary };
    return data.usage ?? null;
  } catch (error) {
    console.warn('[Shadow Inbox] Could not load AI usage:', error);
    return null;
  }
}
