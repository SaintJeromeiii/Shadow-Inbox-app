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
  gmailApiMessageId?: string | null;
  shadowLabels?: ShadowLabel[];
  attachmentScan?: AttachmentScanInfo;
  memoryContext?: MemoryContextInfo;
  calendarGuard?: CalendarGuardInfo;
  channelName?: string | null;
  replyTarget?: ReplyTarget | null;
  status?: 'open' | 'auto_piloted' | 'archived';
  autoPilot?: AutoPilotInfo | null;
}

export interface ShadowLabel {
  key: string;
  name: string;
}

export interface AttachmentScanInfo {
  hasImage?: boolean;
  hasPdf?: boolean;
  labels: string[];
}

export interface MemoryContextInfo {
  injected: boolean;
  matchCount?: number;
}

export interface ReplyTarget {
  platform: 'slack' | 'discord' | 'email';
  channelId: string;
  threadId?: string | null;
  teamId?: string | null;
  guildId?: string | null;
  messageId?: string | null;
  webhookUrl?: string | null;
}

export interface AutoPilotInfo {
  ruleId: string;
  ruleName: string;
  handledAt: string;
  summary: string;
}

export interface CalendarEventPreview {
  title: string;
  start: string;
  end: string;
}

export interface CalendarGuardInfo {
  checked: boolean;
  status: 'clear' | 'conflict' | 'unavailable';
  isFree?: boolean | null;
  proposedWindow?: {
    label: string;
    start: string;
    end: string;
  };
  conflictEvent?: CalendarEventPreview | null;
  surroundingEvents?: CalendarEventPreview[];
  alternativeSlots?: Array<{
    label: string;
    start: string;
    end: string;
  }>;
  badgeMessage?: string;
  needsCalendarScope?: boolean;
  error?: string;
}

export type TriageCategory = 'action_required' | 'fyi' | 'ignore';

export interface TriageResult {
  category: TriageCategory;
  cleanSummary: string;
  suggestedReply: string | null;
  urgencyScore: number;
  actionItems?: Array<{
    title: string;
    project?: string;
    dueHint?: string | null;
  }>;
}

export interface TriagedNotification extends RawNotification {
  triage?: TriageResult;
  archived?: boolean;
}

export type FeedTab = 'action_required' | 'fyi' | 'ignore';
