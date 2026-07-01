import { Alert } from 'react-native';
import { getActiveAccountKey, getRelayUrl } from './emailService';
import type { AccountKey } from '../types/account';
import type {
  AutomationLog,
  AutomationLogStatus,
  AutomationLogStatusFilter,
} from '../types/automationLog';

const ADMIN_BASE_URL = `${getRelayUrl()}/api/admin`;
const ADMIN_TOKEN = process.env.EXPO_PUBLIC_ADMIN_TOKEN ?? '';

function buildAdminHeaders(
  accountKey: AccountKey,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(ADMIN_TOKEN ? { 'x-admin-token': ADMIN_TOKEN } : {}),
    'x-account-key': accountKey,
    ...extra,
  };
}

async function parseAdminJson<T extends { error?: string }>(
  response: Response,
): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) {
      throw new Error(`Admin API error (${response.status})`);
    }
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      response.ok
        ? 'Admin API returned a non-JSON response.'
        : `Admin API error (${response.status})`,
    );
  }
}

async function fetchLogsInternal(
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

  const response = await fetch(`${ADMIN_BASE_URL}/logs?${params.toString()}`, {
    method: 'GET',
    headers: buildAdminHeaders(accountKey),
  });

  const data = await parseAdminJson<{ logs?: AutomationLog[]; error?: string }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to fetch logs');
  }

  return data.logs ?? [];
}

async function triggerRetryInternal(
  id: string,
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<{
  log: AutomationLog;
  replayed: boolean;
  message?: string;
  result?: Record<string, unknown>;
}> {
  const response = await fetch(
    `${ADMIN_BASE_URL}/logs/${encodeURIComponent(id)}/retry?accountKey=${encodeURIComponent(accountKey)}`,
    {
      method: 'POST',
      headers: buildAdminHeaders(accountKey),
      body: JSON.stringify({ accountKey }),
    },
  );

  const data = await parseAdminJson<{
    log?: AutomationLog;
    replayed?: boolean;
    message?: string;
    result?: Record<string, unknown>;
    error?: string;
    details?: string;
  }>(response);

  if (!response.ok || !data.log) {
    throw new Error(data.error ?? data.details ?? 'Retry failed');
  }

  return {
    log: data.log,
    replayed: Boolean(data.replayed),
    message: data.message,
    result: data.result,
  };
}

export const adminLogsService = {
  fetchLogs: async (accountKey: AccountKey): Promise<AutomationLog[]> => {
    try {
      return await fetchLogsInternal({ accountKey, allAccounts: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not load admin logs.';
      console.error('[Logs Service Error]:', error);
      Alert.alert('Error', message);
      return [];
    }
  },

  triggerRetry: async (id: string, accountKey: AccountKey): Promise<boolean> => {
    try {
      const result = await triggerRetryInternal(id, accountKey);
      Alert.alert(
        'Success',
        result.message ?? 'Automation log replay completed successfully!',
      );
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Retry failed';
      console.error('[Retry Action Error]:', error);
      Alert.alert('Retry Failed', message);
      return false;
    }
  },
};

export async function fetchAutomationLogs(
  options: {
    accountKey?: AccountKey;
    status?: AutomationLogStatusFilter;
    limit?: number;
    allAccounts?: boolean;
  } = {},
): Promise<AutomationLog[]> {
  return fetchLogsInternal(options);
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
  return triggerRetryInternal(logId, accountKey);
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
