import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getExpoProjectId(): Promise<string | undefined> {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

const MOCK_PUSH_TOKEN = 'MOCK_EXPO_PUSH_TOKEN';

function isFisAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('FIS_AUTH_ERROR');
}

async function ensureDefaultAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
  });
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Push] Must use a physical device for native push notifications');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Failed to get push token — notification permission denied');
    return null;
  }

  const projectId = await getExpoProjectId();
  if (!projectId) {
    console.warn('[Push] Missing Expo project ID — cannot fetch push token');
    return null;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('[Push Token Generated]:', token);
    await ensureDefaultAndroidChannel();
    return token;
  } catch (error) {
    if (isFisAuthError(error)) {
      console.warn(
        '[Push] FIS_AUTH_ERROR from Firebase — using mock token for development testing:',
        MOCK_PUSH_TOKEN,
      );
      await ensureDefaultAndroidChannel();
      return MOCK_PUSH_TOKEN;
    }

    console.error('[Push] Failed to fetch Expo push token:', error);
    return null;
  }
}
