import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { TriagedNotification } from '../types/notification';

const ALERTED_IDS_KEY = '@shadow_inbox/alerted_action_ids';
const ANDROID_CHANNEL_ID = 'shadow-inbox-action-required';

export type NotificationMode = 'native' | 'expo-go-fallback';

export function getNotificationMode(): NotificationMode {
  // Remote/local push APIs are blocked in Expo Go on Android (SDK 53+).
  // Local notifications on iOS in Expo Go still work; use a dev build for production.
  if (Constants.appOwnership === 'expo' && Platform.OS === 'android') {
    return 'expo-go-fallback';
  }
  return 'native';
}

export function configureNotificationHandler(): void {
  if (getNotificationMode() === 'expo-go-fallback') {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (getNotificationMode() === 'expo-go-fallback') return;

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Action Required',
    description: 'Urgent Shadow Inbox items that need your reply',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B6B',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (getNotificationMode() === 'expo-go-fallback') {
    return true;
  }

  await ensureAndroidNotificationChannel();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return (
    requested.granted ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function loadAlertedActionIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(ALERTED_IDS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export async function saveAlertedActionIds(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(ALERTED_IDS_KEY, JSON.stringify([...ids]));
}

export function parseSubjectLine(rawText: string): string {
  const match = rawText.match(/^Subject:\s*(.+)$/m);
  return match?.[1]?.trim() ?? 'New message';
}

export function parseSenderDisplayName(sender: string): string {
  const quoted = sender.match(/^"([^"]+)"/);
  if (quoted?.[1]) return quoted[1];

  const beforeAngle = sender.match(/^([^<]+)</);
  if (beforeAngle?.[1]) {
    return beforeAngle[1].trim().replace(/^"|"$/g, '');
  }

  const email = sender.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return email?.[0] ?? sender;
}

function buildAlertContent(notification: TriagedNotification): {
  title: string;
  body: string;
} {
  const senderName = parseSenderDisplayName(notification.sender);
  const subjectLine = parseSubjectLine(notification.rawText);

  return {
    title: '🚨 Shadow Inbox Action Required',
    body: `${senderName}: ${subjectLine}`,
  };
}

export async function scheduleActionRequiredAlert(
  notification: TriagedNotification,
): Promise<void> {
  const { title, body } = buildAlertContent(notification);

  if (getNotificationMode() === 'expo-go-fallback') {
    Alert.alert(title, body);
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android' && { channelId: ANDROID_CHANNEL_ID }),
        data: {
          notificationId: notification.id,
          category: 'action_required',
        },
      },
      trigger: null,
    });
  } catch (error) {
    console.warn(
      '[Shadow Inbox] Native notification failed — falling back to in-app alert:',
      error,
    );
    Alert.alert(title, body);
  }
}

export async function alertNewActionRequiredItems(
  notifications: TriagedNotification[],
  alertedIds: Set<string>,
): Promise<Set<string>> {
  const nextAlertedIds = new Set(alertedIds);
  let changed = false;

  for (const notification of notifications) {
    if (notification.archived) continue;
    if (notification.triage?.category !== 'action_required') continue;
    if (nextAlertedIds.has(notification.id)) continue;

    await scheduleActionRequiredAlert(notification);
    nextAlertedIds.add(notification.id);
    changed = true;
  }

  if (changed) {
    await saveAlertedActionIds(nextAlertedIds);
  }

  return nextAlertedIds;
}
