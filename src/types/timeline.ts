export type TimelinePeakUrgency = 'critical' | 'elevated' | 'routine' | 'low';

export interface TimelineHourCounts {
  total: number;
  actionRequired: number;
  fyi: number;
  ignore: number;
  untriaged: number;
  systemAlerts: number;
}

export interface TimelineSignalItem {
  id: string;
  accountLabel: string;
  sender: string;
  subject: string;
  sourceApp: string;
  category: string;
  urgencyScore: number | null;
  summary: string;
  timestamp: string;
  isSystemAlert: boolean;
}

export interface TimelineHourBlock {
  hourKey: string;
  hourLabel: string;
  displayTime: string;
  summary: string;
  peakUrgency: TimelinePeakUrgency;
  counts: TimelineHourCounts;
  items: TimelineSignalItem[];
}

export interface TimelineResponse {
  success: boolean;
  accountKey: string;
  dayKey: string;
  blockCount: number;
  signalCount: number;
  message?: string;
  blocks: TimelineHourBlock[];
}
