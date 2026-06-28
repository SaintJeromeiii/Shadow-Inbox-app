export interface BriefingStats {
  signalCount?: number;
  totalToday: number;
  actionRequired: number;
  fyi: number;
  ignore: number;
  untriaged: number;
  accountCount: number;
}

export interface DailyBriefing {
  success?: boolean;
  quiet?: boolean;
  message?: string | null;
  id?: string;
  generatedAt: string;
  briefingDate: string;
  markdown: string;
  summaryText?: string;
  urgencyLevel?: 'low' | 'routine' | 'elevated' | 'critical';
  mode: 'live' | 'fallback' | 'quiet';
  warning: string | null;
  stats: BriefingStats;
  accountKeys: string[];
  accountKey?: string;
}
