export type ReplyTone = 'casual' | 'direct' | 'professional' | 'quick_template';

export const REPLY_TONE_OPTIONS: Array<{
  key: ReplyTone;
  label: string;
}> = [
  { key: 'casual', label: 'Casual' },
  { key: 'direct', label: 'Direct' },
  { key: 'professional', label: 'Professional' },
  { key: 'quick_template', label: 'Quick Template' },
];

export const DEFAULT_REPLY_TONE: ReplyTone = 'professional';
