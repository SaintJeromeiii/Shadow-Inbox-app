import { getActiveAccountKey, relayFetch } from './emailService';
import type { AccountKey } from '../types/account';
import type {
  AutomationLog,
  AutomationLogStatus,
  AutomationLogStatusFilter,
} from '../types/automationLog';

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

export async function fetchAutomationLogs(
  options: {
    accountKey?: AccountKey;
    status?: AutomationLogStatusFilter;
    limit?: number;
    allAccounts?: boolean;
  } = {},
): Promise<AutomationLog[]> {
  const accountKey = options.accountKey ?? getActiveAccountKey();
  const params = new URLSearchParams({
    accountKey,
    limit: String(options.limit ?? 50),
  });

  if (options.status && options.status !== 'all') {
    params.set('status', options.status);
  }
  if (options.allAccounts) {
    params.set('allAccounts', 'true');
  }

  const response = await relayFetch(`/api/admin/logs?${params.toString()}`, {
    method: 'GET',
    headers: { 'X-Account-Key': accountKey },
  });

  const data = await parseRelayJson<{ logs?: AutomationLog[]; error?: string }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? `Failed to load automation logs (${response.status})`);
  }

  return data.logs ?? [];
}

export async function replayAutomationLog(
  logId: string,
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<{
  log: AutomationLog;
  replayed: boolean;
  message?: string;
  result?: Record<string, unknown>;
}> {
  const response = await relayFetch(`/api/admin/logs/${encodeURIComponent(logId)}/retry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Account-Key': accountKey,
    },
    body: JSON.stringify({ accountKey }),
  });

  const data = await parseRelayJson<{
    log?: AutomationLog;
    replayed?: boolean;
    message?: string;
    result?: Record<string, unknown>;
    error?: string;
  }>(response);

  if (!response.ok || !data.log) {
    throw new Error(data.error ?? `Failed to replay automation log (${response.status})`);
  }

  return {
    log: data.log,
    replayed: Boolean(data.replayed),
    message: data.message,
    result: data.result,
  };
}

export function formatAutomationLogTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatAutomationEventType(eventType: string): string {
  return eventType.replace(/_/g, ' ').toUpperCase();
}

export function getStatusBadgeColor(status: AutomationLogStatus): string {
  switch (status) {
    case 'completed':
      return '#66FF99';
    case 'pending':
    case 'processing':
      return '#FFE066';
    case 'failed':
    case 'dead_letter':
      return '#FF4466';
    default:
      return '#7AA8CC';
  }
}

export const AUTOMATION_LOG_FILTERS: { label: string; value: AutomationLogStatusFilter }[] = [
  { label: 'ALL', value: 'all' },
  { label: 'FAILED', value: 'failed' },
  { label: 'DEAD LETTER', value: 'dead_letter' },
  { label: 'PENDING', value: 'pending' },
  { label: 'PROCESSING', value: 'processing' },
  { label: 'COMPLETED', value: 'completed' },
];
