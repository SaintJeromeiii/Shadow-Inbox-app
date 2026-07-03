import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Device from 'expo-device';
import { useAccount } from '../context/AccountContext';
import { usePushNavigation } from '../context/PushNavigationContext';
import { usePushStatus } from '../context/PushStatusContext';
import {
  getNotificationMode,
  registerDeviceWithRelay,
  registerForPushNotificationsAsync,
} from '../services/pushNotifications';

export default function NotificationBootstrap() {
  const { activeAccount, ready } = useAccount();
  const { handlePushOpen } = usePushNavigation();
  const { setPushStatus } = usePushStatus();

  useEffect(() => {
    void (async () => {
      if (!Device.isDevice) {
        setPushStatus({ state: 'simulator' });
        console.warn('[Shadow Inbox] Push setup skipped — not a physical device.');
        return;
      }

      const registration = await registerForPushNotificationsAsync();
      setPushStatus({ state: registration.state, detail: registration.detail });

      if (!registration.token) {
        if (registration.state !== 'ready') {
          console.warn(
            '[Shadow Inbox] Push token unavailable:',
            registration.state,
            registration.detail ?? '',
          );
        }
        return;
      }

      if (ready) {
        await registerDeviceWithRelay(activeAccount, registration.token);
      }
    })();

    if (getNotificationMode() === 'expo-go-fallback') {
      return;
    }

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) {
        return;
      }

      const data = response.notification.request.content.data as {
        notificationId?: string;
        accountKey?: string;
      };

      if (data.notificationId) {
        handlePushOpen({
          notificationId: data.notificationId,
          accountKey: data.accountKey,
        });
      }
    });

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

        if (data.notificationId) {
          handlePushOpen({
            notificationId: data.notificationId,
            accountKey: data.accountKey,
          });
        }
      });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [activeAccount, ready, handlePushOpen, setPushStatus]);

  useEffect(() => {
    if (!ready || getNotificationMode() === 'expo-go-fallback') {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      void (async () => {
        const registration = await registerForPushNotificationsAsync();
        setPushStatus({ state: registration.state, detail: registration.detail });
        if (registration.token) {
          await registerDeviceWithRelay(activeAccount, registration.token);
        }
      })();
    });

    return () => {
      subscription.remove();
    };
  }, [activeAccount, ready, setPushStatus]);

  return null;
}
