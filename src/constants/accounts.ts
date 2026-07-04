import type { AccountKey, AccountProfile } from '../types/account';

const DEV_BUILTIN_ACCOUNT_PROFILES: AccountProfile[] = [
  {
    key: 'personal',
    label: 'Personal Account',
    email: 'jleonandersonjr@gmail.com',
    initials: 'JA',
    accentColor: '#5B8DEF',
  },
  {
    key: 'work',
    label: 'Work/Dev Account',
    email: 'shadowdev@gmail.com',
    initials: 'SD',
    accentColor: '#6EE7A0',
    mockOnly: true,
  },
];

export const BUILTIN_ACCOUNT_PROFILES: AccountProfile[] = __DEV__
  ? DEV_BUILTIN_ACCOUNT_PROFILES
  : [];

export const EMPTY_ACCOUNT_PROFILE: AccountProfile = {
  key: '',
  label: 'Link Gmail',
  email: '',
  initials: '--',
  accentColor: '#5B8DEF',
  mockOnly: true,
};

export function findAccountProfile(
  key: AccountKey,
  accounts: AccountProfile[],
): AccountProfile {
  return (
    accounts.find((account) => account.key === key) ??
    BUILTIN_ACCOUNT_PROFILES.find((account) => account.key === key) ??
    accounts[0] ??
    BUILTIN_ACCOUNT_PROFILES[0] ??
    EMPTY_ACCOUNT_PROFILE
  );
}

export function isKnownAccountKey(
  value: string,
  accounts: AccountProfile[],
): boolean {
  return accounts.some((account) => account.key === value);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;

  const visible = local.slice(0, Math.min(6, local.length));
  return `${visible}…[at]${domain}`;
}
