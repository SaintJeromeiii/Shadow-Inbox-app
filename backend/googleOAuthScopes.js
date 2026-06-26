/**
 * OAuth scopes requested at sign-in. Must stay in sync with
 * src/constants/googleOAuthScopes.ts (React Native GoogleSignin).
 */
const GOOGLE_OAUTH_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
  'profile',
];

const CALENDAR_READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function accountScopeIncludes(scopeString, requiredScope) {
  if (!scopeString || !requiredScope) return false;
  return String(scopeString).split(/\s+/).includes(requiredScope);
}

function accountHasCalendarScope(account) {
  return accountScopeIncludes(account?.scope, CALENDAR_READONLY_SCOPE);
}

module.exports = {
  GOOGLE_OAUTH_SCOPES,
  CALENDAR_READONLY_SCOPE,
  accountScopeIncludes,
  accountHasCalendarScope,
};
