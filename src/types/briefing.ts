export interface BriefingStats {
  totalToday: number;
  actionRequired: number;
  fyi: number;
  ignore: number;
  untriaged: number;
  accountCount: number;
}

export interface DailyBriefing {
  generatedAt: string;
  briefingDate: string;
  markdown: string;
  mode: 'live' | 'fallback';
  warning: string | null;
  stats: BriefingStats;
  accountKeys: string[];
}
