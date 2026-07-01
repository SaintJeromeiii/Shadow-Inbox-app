export type DrawerRoute =
  | 'play_stage'
  | 'fighter_select'
  | 'fighter_rankings'
  | 'firewall_config'
  | 'hero_status'
  | 'intel_deck'
  | 'auto_pilot'
  | 'knowledge_core'
  | 'admin_logs'
  | 'settings';

export interface DrawerMenuItem {
  route: DrawerRoute;
  label: string;
  subtitle: string;
}

export const PRIMARY_DRAWER_ITEMS: DrawerMenuItem[] = [
  {
    route: 'play_stage',
    label: 'PLAY STAGE',
    subtitle: 'Main signal timeline feed',
  },
  {
    route: 'firewall_config',
    label: 'FIREWALL CONFIG',
    subtitle: 'Smart firewall routing rules',
  },
  {
    route: 'hero_status',
    label: 'HERO STATUS',
    subtitle: 'Armor tier & deletion stats',
  },
  {
    route: 'fighter_select',
    label: 'CHANGE FIGHTER',
    subtitle: 'Swap operative — each has own XP',
  },
  {
    route: 'fighter_rankings',
    label: 'FIGHTER RANKINGS',
    subtitle: 'Leaderboard & coming soon roster',
  },
];

export const SECONDARY_DRAWER_ITEMS: DrawerMenuItem[] = [
  {
    route: 'intel_deck',
    label: 'INTEL DECK',
    subtitle: 'Briefing, quests, finance, timeline',
  },
  {
    route: 'auto_pilot',
    label: 'AUTO-PILOT',
    subtitle: 'Automated reply rules',
  },
  {
    route: 'knowledge_core',
    label: 'KNOWLEDGE CORE',
    subtitle: 'AI memory synthesis',
  },
  {
    route: 'admin_logs',
    label: 'OPS CONSOLE',
    subtitle: 'Automation logs & replay',
  },
  {
    route: 'settings',
    label: 'SETTINGS',
    subtitle: 'Profile, privacy, Gmail',
  },
];
