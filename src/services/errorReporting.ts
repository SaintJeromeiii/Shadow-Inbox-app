/**
 * Optional crash reporting — enabled when EXPO_PUBLIC_SENTRY_DSN is set in local .env
 * (or EAS build env). Railway backend env does NOT apply to the mobile app — rebuild after adding.
 */
let sentryReady = false;

export function initErrorReporting(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
    Sentry.init({
      dsn,
      enableInExpoDevelopment: false,
      tracesSampleRate: 0.15,
      environment: __DEV__ ? 'development' : 'production',
    });
    sentryReady = true;
  } catch (error) {
    console.warn('[Shadow Inbox] Sentry init skipped:', error);
  }
}

export function wrapRootComponent<T>(component: T): T {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return component;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
    return Sentry.wrap(component) as T;
  } catch {
    return component;
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!sentryReady) {
    console.error('[Shadow Inbox]', error, context ?? '');
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
    Sentry.captureException(error, { extra: context });
  } catch {
    console.error('[Shadow Inbox]', error, context ?? '');
  }
}
