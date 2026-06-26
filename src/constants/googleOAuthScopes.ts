/**
 * OAuth scopes requested at sign-in. Must stay in sync with
 * backend/googleOAuthScopes.js (relay token storage / Calendar API).
 */
export const GOOGLE_OAUTH_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
  'profile',
] as const;

export const CALENDAR_READONLY_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly';
