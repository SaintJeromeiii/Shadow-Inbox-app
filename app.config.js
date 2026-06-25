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
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'shadow-inbox',
    userInterfaceStyle: 'light',
    ios: {
      bundleIdentifier: 'com.saintjeromeiii.shadowinbox',
      supportsTablet: true,
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
        },
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.saintjeromeiii.shadowinbox',
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
          color: '#5B8DEF',
        },
      ],
      'expo-web-browser',
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme,
        },
      ],
    ],
    extra: {
      eas: {
        projectId: 'eee5a56a-2363-4537-88a8-d0ec37f916b7',
      },
    },
    owner: 'jleonanderson12',
  },
};
