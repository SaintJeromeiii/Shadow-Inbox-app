import { relayFetch, relayHeaders } from './emailService';
import type { AiUsageSummary } from './aiUsageService';
import type { FinanceSummary } from '../types/finance';

export interface RunCostUsageTotals {
  triage: number;
  llm: number;
  embedding: number;
}

export interface RunCostProviderEstimate {
  key: string;
  label: string;
  amount: number;
  source: 'manual_estimate' | 'estimated_from_usage';
}

export interface RunCostAiCostSummary {
  monthKey: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byType: {
    triage: { totalTokens: number; estimatedCostUsd: number };
    llm: { totalTokens: number; estimatedCostUsd: number };
    embedding: { totalTokens: number; estimatedCostUsd: number };
  };
}

export interface RunCostSummary {
  accountKey: string;
  monthKey: string;
  finance: FinanceSummary;
  aiToday: AiUsageSummary;
  aiMonthUsage: RunCostUsageTotals;
  aiCostSummary: RunCostAiCostSummary;
  providerEstimates: RunCostProviderEstimate[];
  visibility: {
    liveProviderBillingConnected: boolean;
    canSeeBillingEmails: boolean;
    canEstimateAiFromUsage: boolean;
    hasTokenBasedAiCosting: boolean;
  };
  totals: {
    trackedLedgerMonthToDate: number;
    providerEstimateMonthToDate: number;
    combinedViewMonthToDate: number;
  };
}

export async function fetchRunCostSummary(): Promise<RunCostSummary | null> {
  if (!relayHeaders()['X-Account-Key']) {
    return null;
  }

  try {
    const response = await relayFetch('/api/user/run-cost', {
      method: 'GET',
      headers: relayHeaders(),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { summary?: RunCostSummary };
    return data.summary ?? null;
  } catch (error) {
    console.warn('[Shadow Inbox] Could not load run cost summary:', error);
    return null;
  }
}
