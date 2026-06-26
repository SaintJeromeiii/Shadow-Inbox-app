import { useEffect } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useAccount } from '../context/AccountContext';
import {
  configureNotificationHandler,
  getNotificationMode,
  registerDeviceWithRelay,
  requestNotificationPermissions,
} from '../services/pushNotifications';

export default function NotificationBootstrap() {
  const { activeAccount, ready } = useAccount();

  useEffect(() => {
    configureNotificationHandler();

    void (async () => {
      if (!Device.isDevice) {
        console.warn('[Shadow Inbox] Push setup skipped — not a physical device.');
        return;
      }

      const granted = await requestNotificationPermissions();
      if (!granted) {
        console.warn('[Shadow Inbox] Notification permissions were not granted.');
        return;
      }

      if (ready) {
        await registerDeviceWithRelay(activeAccount);
      }
    })();

    if (getNotificationMode() === 'expo-go-fallback') {
      return;
    }

    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log(
          '[Shadow Inbox] Push received:',
          notification.request.content.title,
        );
      },
    );

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as {
          notificationId?: string;
          accountKey?: string;
          alertKind?: string;
        };

        console.log('[Shadow Inbox] Push opened:', data);
      });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [activeAccount, ready]);

  return null;
}
