export type NotificationSource =
  | 'Email'
  | 'Slack'
  | 'Discord'
  | 'SMS'
  | 'WhatsApp';

export interface RawNotification {
  id: string;
  sourceApp: NotificationSource;
  sender: string;
  rawText: string;
  timestamp: string;
  messageIdHeader?: string | null;
  gmailMessageId?: string | null;
  shadowLabels?: ShadowLabel[];
}

export interface ShadowLabel {
  key: string;
  name: string;
}

export type TriageCategory = 'action_required' | 'fyi' | 'ignore';

export interface TriageResult {
  category: TriageCategory;
  cleanSummary: string;
  suggestedReply: string | null;
  urgencyScore: number;
}

export interface TriagedNotification extends RawNotification {
  triage?: TriageResult;
  archived?: boolean;
}

export type FeedTab = 'action_required' | 'fyi' | 'ignore';
