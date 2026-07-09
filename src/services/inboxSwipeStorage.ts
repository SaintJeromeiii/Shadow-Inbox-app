import AsyncStorage from '@react-native-async-storage/async-storage';

export type InboxSwipeAction = 'archive' | 'trash' | 'snooze';

export interface InboxSwipeSettings {
  swipeLeft: InboxSwipeAction;
  swipeRight: InboxSwipeAction;
}

const STORAGE_KEY = '@shadow_inbox/inbox_swipe_settings';

export const DEFAULT_INBOX_SWIPE_SETTINGS: InboxSwipeSettings = {
  swipeLeft: 'trash',
  swipeRight: 'archive',
};

function isSwipeAction(value: unknown): value is InboxSwipeAction {
  return value === 'archive' || value === 'trash' || value === 'snooze';
}

export async function loadInboxSwipeSettings(): Promise<InboxSwipeSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_INBOX_SWIPE_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<InboxSwipeSettings>;
    return {
      swipeLeft: isSwipeAction(parsed.swipeLeft)
        ? parsed.swipeLeft
        : DEFAULT_INBOX_SWIPE_SETTINGS.swipeLeft,
      swipeRight: isSwipeAction(parsed.swipeRight)
        ? parsed.swipeRight
        : DEFAULT_INBOX_SWIPE_SETTINGS.swipeRight,
    };
  } catch {
    return DEFAULT_INBOX_SWIPE_SETTINGS;
  }
}

export async function saveInboxSwipeSettings(
  settings: InboxSwipeSettings,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
