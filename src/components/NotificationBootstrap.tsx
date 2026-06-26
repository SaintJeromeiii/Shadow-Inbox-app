import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import {
  configureNotificationHandler,
  getNotificationMode,
  registerDeviceWithRelay,
} from '../services/pushNotifications';

export default function NotificationBootstrap() {
  useEffect(() => {
    configureNotificationHandler();
    void registerDeviceWithRelay();

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
        };

        console.log('[Shadow Inbox] Push opened:', data);
      });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  return null;
}
