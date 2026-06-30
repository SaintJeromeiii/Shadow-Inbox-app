export type AutomationLogStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'dead_letter';

export type AutomationLogEventType = 'inbound_webhook' | 'outbound_relay' | string;

export interface AutomationLog {
  id: string;
  messageId: string;
  accountKey: string;
  eventType: AutomationLogEventType;
  status: AutomationLogStatus;
  errorMessage: string | null;
  retryCount: number;
  payload: Record<string, unknown>;
  resultPayload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type AutomationLogStatusFilter = AutomationLogStatus | 'all';
