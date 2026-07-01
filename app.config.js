require('dotenv').config();

function normalizeGoogleClientId(value) {
  return String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function getGoogleReverseClientScheme(clientId) {
  const normalized = normalizeGoogleClientId(clientId);
  const clientPrefix = normalized.replace(/\.apps\.googleusercontent\.com$/i, '');

  if (!clientPrefix || clientPrefix === normalized) {
    return '';
  }

  return `com.googleusercontent.apps.${clientPrefix}`;
}

const webClientId = normalizeGoogleClientId(
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
);
const iosUrlScheme =
  getGoogleReverseClientScheme(webClientId) ||
  'com.googleusercontent.apps.placeholder';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'Shadow-Inbox',
    slug: 'Shadow-Inbox',
    version: '1.0.0',
    description:
      'AI-powered Gmail triage, smart drafts, and arcade-style inbox clearing. Server-side AI keeps your keys off your phone.',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'shadow-inbox',
    userInterfaceStyle: 'dark',
    ios: {
      bundleIdentifier: 'com.saintjeromeiii.shadowinbox',
      supportsTablet: true,
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
        },
        ITSAppUsesNonExemptEncryption: false,
        NSMicrophoneUsageDescription:
          'Shadow Inbox uses the microphone for voice notes and hands-free email draft commands.',
      },
    },
    android: {
      package: 'com.saintjeromeiii.shadowinbox',
      googleServicesFile: './google-services.json',
      usesCleartextTraffic: true,
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-dev-client',
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#ffffff',
        },
      ],
      'expo-web-browser',
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme,
        },
      ],
      [
        'expo-audio',
        {
          microphonePermission:
            'Allow Shadow Inbox to record voice notes and email draft commands.',
        },
      ],
      'expo-video',
    ],
    extra: {
      eas: {
        projectId: 'eee5a56a-2363-4537-88a8-d0ec37f916b7',
      },
      emailRelayUrl:
        process.env.EXPO_PUBLIC_EMAIL_RELAY_URL ??
        'https://shadow-inbox-production.up.railway.app',
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    },
    owner: 'jleonanderson12',
  },
};
