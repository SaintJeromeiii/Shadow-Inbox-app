export type AccountKey = string;

export interface AccountProfile {
  key: AccountKey;
  label: string;
  email: string;
  initials: string;
  accentColor: string;
  mockOnly?: boolean;
  oauth?: boolean;
  imapConfigured?: boolean;
}
