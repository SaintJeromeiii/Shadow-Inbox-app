export interface ShadowLabel {
  key: string;
  name: string;
}

export const SHADOW_LABEL_STYLES: Record<
  string,
  { backgroundColor: string; borderColor: string; textColor: string }
> = {
  action_required: {
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderColor: 'rgba(255, 107, 107, 0.35)',
    textColor: '#FF9B9B',
  },
  fyi: {
    backgroundColor: 'rgba(91, 141, 239, 0.12)',
    borderColor: 'rgba(91, 141, 239, 0.35)',
    textColor: '#9EB8F0',
  },
  ignore: {
    backgroundColor: 'rgba(139, 147, 168, 0.12)',
    borderColor: 'rgba(139, 147, 168, 0.28)',
    textColor: '#A8B0C4',
  },
  servicelog: {
    backgroundColor: 'rgba(110, 231, 160, 0.1)',
    borderColor: 'rgba(110, 231, 160, 0.28)',
    textColor: '#8BE8B8',
  },
  dealshield: {
    backgroundColor: 'rgba(255, 179, 71, 0.12)',
    borderColor: 'rgba(255, 179, 71, 0.32)',
    textColor: '#FFC978',
  },
  alpharounds: {
    backgroundColor: 'rgba(192, 132, 252, 0.12)',
    borderColor: 'rgba(192, 132, 252, 0.32)',
    textColor: '#D7B4FF',
  },
  app_feedback: {
    backgroundColor: 'rgba(103, 232, 249, 0.1)',
    borderColor: 'rgba(103, 232, 249, 0.28)',
    textColor: '#8DE9F7',
  },
};

export function formatShadowLabelName(name: string): string {
  const stripped = name.replace(/^Shadow\//, '');
  if (stripped === 'Action-Required') return 'OPEN CASE';
  return stripped;
}
