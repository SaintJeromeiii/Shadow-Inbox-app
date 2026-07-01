import { getRelayUrl, relayFetch, relayHeaders } from './emailService';
import type { AutoPilotHistoryEntry, AutoPilotRule } from '../types/autoPilot';

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

export async function fetchAutoPilotRules(): Promise<{
  rules: AutoPilotRule[];
  activeCount: number;
}> {
  const response = await relayFetch('/api/auto-pilot/rules', {
    method: 'GET',
    headers: relayHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to load auto-pilot rules (${response.status})`);
  }

  const data = await parseRelayJson<{
    rules?: AutoPilotRule[];
    activeCount?: number;
  }>(response);

  return {
    rules: data.rules ?? [],
    activeCount: data.activeCount ?? 0,
  };
}

export async function createAutoPilotRule(input: {
  name: string;
  platform: string;
  condition: string;
  action: 'reply' | 'archive';
  replyText?: string;
  enabled?: boolean;
}): Promise<AutoPilotRule> {
  const response = await relayFetch('/api/auto-pilot/rules', {
    method: 'POST',
    headers: relayHeaders(),
    body: JSON.stringify(input),
  });

  const data = await parseRelayJson<{ rule?: AutoPilotRule; error?: string }>(response);
  if (!response.ok || !data.rule) {
    throw new Error(data.error ?? `Failed to create rule (${response.status})`);
  }

  return data.rule;
}

export async function toggleAutoPilotRule(
  ruleId: string,
  enabled: boolean,
): Promise<AutoPilotRule> {
  const response = await relayFetch(`/api/auto-pilot/rules/${encodeURIComponent(ruleId)}/toggle`, {
    method: 'POST',
    headers: relayHeaders(),
    body: JSON.stringify({ enabled }),
  });

  const data = await parseRelayJson<{ rule?: AutoPilotRule; error?: string }>(response);
  if (!response.ok || !data.rule) {
    throw new Error(data.error ?? `Failed to toggle rule (${response.status})`);
  }

  return data.rule;
}

export async function fetchAutoPilotHistory(limit = 40): Promise<AutoPilotHistoryEntry[]> {
  const response = await relayFetch(`/api/auto-pilot/history?limit=${limit}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to load automation history (${response.status})`);
  }

  const data = await parseRelayJson<{ entries?: AutoPilotHistoryEntry[] }>(response);
  return data.entries ?? [];
}

export function formatAutoPilotTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRulePlatform(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'slack':
      return '💬 Slack';
    case 'discord':
      return '🎮 Discord';
    case 'email':
      return '✉️ Gmail';
    default:
      return '🌐 Any';
  }
}

export { getRelayUrl };
