/** Strip quotes and whitespace from env-sourced client IDs. */
export function normalizeGoogleClientId(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

/**
 * Google Android redirect URI (reverse client ID scheme).
 * Example client: 123-abc.apps.googleusercontent.com
 * Redirect:     com.googleusercontent.apps.123-abc:/oauth2redirect
 */
export function getGoogleReverseClientRedirectUri(androidClientId: string): string {
  const normalized = normalizeGoogleClientId(androidClientId);
  const clientPrefix = normalized.replace(/\.apps\.googleusercontent\.com$/i, '');

  if (!clientPrefix || clientPrefix === normalized) {
    throw new Error('Invalid Android OAuth client ID format.');
  }

  return `com.googleusercontent.apps.${clientPrefix}:/oauth2redirect`;
}

export function getGoogleReverseClientScheme(androidClientId: string): string {
  const normalized = normalizeGoogleClientId(androidClientId);
  const clientPrefix = normalized.replace(/\.apps\.googleusercontent\.com$/i, '');

  if (!clientPrefix || clientPrefix === normalized) {
    return '';
  }

  return `com.googleusercontent.apps.${clientPrefix}`;
}
