import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { TriagedNotification } from '../types/notification';
import { getActiveAccountKey, getRelayUrl } from './emailService';

const ALERTED_IDS_KEY = '@shadow_inbox/alerted_action_ids';
const PUSH_TOKEN_KEY = '@shadow_inbox/expo_push_token';
export const ANDROID_HIGH_PRIORITY_CHANNEL_ID = 'shadow-inbox-high-priority';
const HIGH_URGENCY_THRESHOLD = 7;

export type NotificationMode = 'native' | 'expo-go-fallback';

export function getNotificationMode(): NotificationMode {
  if (Constants.appOwnership === 'expo' && Platform.OS === 'android') {
    return 'expo-go-fallback';
  }
  return 'native';
}

export function resolvePriorityLevel(urgencyScore: number): 'high' | 'medium' | 'low' {
  if (urgencyScore >= HIGH_URGENCY_THRESHOLD) return 'high';
  if (urgencyScore >= 4) return 'medium';
  return 'low';
}

export function shouldSendPriorityAlert(notification: TriagedNotification): boolean {
  const triage = notification.triage;
  if (!triage || triage.category !== 'action_required') return false;
  return resolvePriorityLevel(triage.urgencyScore) === 'high';
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

  await Notifications.setNotificationChannelAsync(ANDROID_HIGH_PRIORITY_CHANNEL_ID, {
    name: 'High Priority Alerts',
    description: 'Critical Shadow Inbox emails that need immediate attention',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 280, 180, 280],
    lightColor: '#FF6B6B',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (getNotificationMode() === 'expo-go-fallback') {
    return true;
  }

  if (!Device.isDevice) {
    console.warn('[Shadow Inbox] Push notifications require a physical device.');
    return false;
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

async function getExpoProjectId(): Promise<string | undefined> {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

export async function getDevicePushToken(): Promise<string | null> {
  if (getNotificationMode() === 'expo-go-fallback') {
    return null;
  }

  if (!Device.isDevice) {
    return null;
  }

  const granted = await requestNotificationPermissions();
  if (!granted) return null;

  const projectId = await getExpoProjectId();
  if (!projectId) {
    console.warn('[Shadow Inbox] Missing Expo project ID — cannot fetch push token.');
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export async function registerDeviceWithRelay(
  accountKey?: string,
  pushTokenOverride?: string | null,
): Promise<boolean> {
  if (getNotificationMode() === 'expo-go-fallback') {
    return false;
  }

  try {
    const pushToken = pushTokenOverride ?? (await getDevicePushToken());
    if (!pushToken) return false;

    const previousToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (previousToken && previousToken !== pushToken) {
      await unregisterDeviceFromRelay(previousToken);
    }

    const resolvedAccountKey = accountKey ?? getActiveAccountKey();
    const response = await fetch(`${getRelayUrl()}/api/notifications/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Account-Key': resolvedAccountKey,
      },
      body: JSON.stringify({
        pushToken,
        platform: Platform.OS,
        deviceName: Device.modelName ?? Constants.deviceName ?? null,
        accountKey: resolvedAccountKey,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Relay returned ${response.status}`);
    }

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, pushToken);
    return true;
  } catch (error) {
    console.warn('[Shadow Inbox] Device push registration failed:', error);
    return false;
  }
}

export async function unregisterDeviceFromRelay(pushToken: string): Promise<void> {
  try {
    await fetch(`${getRelayUrl()}/api/notifications/unregister-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pushToken }),
    });
  } catch (error) {
    console.warn('[Shadow Inbox] Device push unregister failed:', error);
  }
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

function buildAlertContent(
  notification: TriagedNotification,
  accountLabel = 'Shadow Inbox',
): {
  title: string;
  body: string;
} {
  const senderName = parseSenderDisplayName(notification.sender);
  const reason =
    notification.triage?.cleanSummary?.trim() ||
    'Requires your immediate attention.';

  return {
    title: `🚨 High Priority ${accountLabel}`,
    body: `From: ${senderName}: ${reason}`,
  };
}

export async function scheduleActionRequiredAlert(
  notification: TriagedNotification,
  accountLabel = 'Shadow Inbox',
): Promise<void> {
  const { title, body } = buildAlertContent(notification, accountLabel);

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
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'android' && {
          channelId: ANDROID_HIGH_PRIORITY_CHANNEL_ID,
        }),
        data: {
          notificationId: notification.id,
          category: 'action_required',
          priorityLevel: 'high',
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
  accountLabel = 'Shadow Inbox',
): Promise<Set<string>> {
  const nextAlertedIds = new Set(alertedIds);
  let changed = false;

  for (const notification of notifications) {
    if (notification.archived) continue;
    if (!shouldSendPriorityAlert(notification)) continue;
    if (nextAlertedIds.has(notification.id)) continue;

    await scheduleActionRequiredAlert(notification, accountLabel);
    nextAlertedIds.add(notification.id);
    changed = true;
  }

  if (changed) {
    await saveAlertedActionIds(nextAlertedIds);
  }

  return nextAlertedIds;
}
