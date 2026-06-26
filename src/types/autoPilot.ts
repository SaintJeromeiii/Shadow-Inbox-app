export type AutoPilotAction = 'reply' | 'archive';

export interface AutoPilotRule {
  id: string;
  name: string;
  platform: string;
  condition: string;
  action: AutoPilotAction;
  replyText: string | null;
  autoCloseTask: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AutoPilotHistoryEntry {
  id: string;
  timestamp: string;
  accountKey: string;
  notificationId: string;
  platform: string;
  sender: string;
  ruleId: string;
  ruleName: string;
  action: AutoPilotAction;
  replyText: string | null;
  summary: string;
  autoCloseTask: boolean;
}
