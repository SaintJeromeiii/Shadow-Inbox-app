export type FirewallRuleType = 'sender' | 'subject_keyword' | 'app_source';

export type FirewallActionEffect =
  | 'MUTED_ARCHIVE'
  | 'HIGH_PRIORITY_PUSH'
  | 'BLOCK_DROP';

export interface FirewallRule {
  id: string;
  userId: string;
  ruleType: FirewallRuleType;
  matchValue: string;
  actionEffect: FirewallActionEffect;
  isActive: boolean;
  createdAt: string;
}

export interface CreateFirewallRuleInput {
  ruleType: FirewallRuleType;
  matchValue: string;
  actionEffect: FirewallActionEffect;
}
