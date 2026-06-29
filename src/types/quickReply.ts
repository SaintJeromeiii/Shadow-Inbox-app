export interface QuickReplyOptions {
  acknowledge: string;
  moreInfo: string;
  defer: string;
}

export interface QuickReplyGenerateResult {
  success: boolean;
  messageId?: string | null;
  options: QuickReplyOptions;
  option1: string;
  option2: string;
  option3: string;
  mode: 'live' | 'fallback';
  warning: string | null;
}

export type QuickReplyChipKey = 'acknowledge' | 'moreInfo' | 'defer';

export const QUICK_REPLY_CHIP_LABELS: Record<QuickReplyChipKey, string> = {
  acknowledge: 'Acknowledge',
  moreInfo: 'More Info',
  defer: 'Defer',
};
