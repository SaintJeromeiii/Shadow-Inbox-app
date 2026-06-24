import type { NotificationSource } from '../types/notification';

export const SOURCE_COLORS: Record<NotificationSource, string> = {
  Email: '#E85D4C',
  Slack: '#4A154B',
  Discord: '#5865F2',
  SMS: '#34C759',
  WhatsApp: '#25D366',
};

export const SOURCE_LABELS: Record<NotificationSource, string> = {
  Email: 'Email',
  Slack: 'Slack',
  Discord: 'Discord',
  SMS: 'SMS',
  WhatsApp: 'WhatsApp',
};
