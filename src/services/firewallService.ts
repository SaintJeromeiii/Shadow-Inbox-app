import { getActiveAccountKey, relayFetch } from './emailService';
import type { AccountKey } from '../types/account';
import type {
  CreateFirewallRuleInput,
  FirewallRule,
} from '../types/firewall';

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

export async function fetchFirewallRules(
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<FirewallRule[]> {
  const params = new URLSearchParams({ accountKey });
  const response = await relayFetch(`/api/firewall/rules?${params.toString()}`, {
    method: 'GET',
    headers: { 'X-Account-Key': accountKey },
  });

  if (!response.ok) {
    throw new Error(`Failed to load firewall rules (${response.status})`);
  }

  const data = await parseRelayJson<{ rules?: FirewallRule[] }>(response);
  return data.rules ?? [];
}

export async function createFirewallRule(
  input: CreateFirewallRuleInput,
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<FirewallRule> {
  const response = await relayFetch('/api/firewall/rules', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Account-Key': accountKey,
    },
    body: JSON.stringify({
      ...input,
      accountKey,
    }),
  });

  const data = await parseRelayJson<{ rule?: FirewallRule; error?: string }>(response);
  if (!response.ok || !data.rule) {
    throw new Error(data.error ?? `Failed to create firewall rule (${response.status})`);
  }

  return data.rule;
}

export async function deleteFirewallRule(
  ruleId: string,
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<void> {
  const response = await relayFetch(
    `/api/firewall/rules/${encodeURIComponent(ruleId)}?accountKey=${encodeURIComponent(accountKey)}`,
    {
      method: 'DELETE',
      headers: { 'X-Account-Key': accountKey },
    },
  );

  const data = await parseRelayJson<{ error?: string }>(response);
  if (!response.ok) {
    throw new Error(data.error ?? `Failed to delete firewall rule (${response.status})`);
  }
}

export function formatFirewallRuleType(ruleType: FirewallRule['ruleType']): string {
  switch (ruleType) {
    case 'sender':
      return 'Sender';
    case 'subject_keyword':
      return 'Subject Keyword';
    case 'app_source':
      return 'App Source';
    default:
      return ruleType;
  }
}

export function formatFirewallAction(action: FirewallRule['actionEffect']): string {
  switch (action) {
    case 'MUTED_ARCHIVE':
      return 'Mute & Archive';
    case 'HIGH_PRIORITY_PUSH':
      return 'High Priority';
    case 'BLOCK_DROP':
      return 'Block & Drop';
    default:
      return action;
  }
}
