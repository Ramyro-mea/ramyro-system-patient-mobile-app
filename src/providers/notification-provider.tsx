import { PropsWithChildren, useEffect } from 'react';
import type { DevicePushToken } from 'expo-notifications';

import { useAuth } from '@/src/providers/auth-provider';
import {
  addPatientPushTokenListener,
  registerPatientPushNotifications,
} from '@/src/services/push-notifications';

export function NotificationProvider({ children }: PropsWithChildren) {
  const { status, token } = useAuth();

  useEffect(() => {
    if (status !== 'authenticated' || !token) {
      return;
    }

    let active = true;
    const syncToken = async (devicePushToken?: DevicePushToken) => {
      if (!active) {
        return;
      }

      try {
        await registerPatientPushNotifications(token, devicePushToken);
      } catch {
        // Notifications are optional; authentication and portal use must continue.
      }
    };

    void syncToken();
    const tokenSubscription = addPatientPushTokenListener(syncToken);

    return () => {
      active = false;
      tokenSubscription.remove();
    };
  }, [status, token]);

  return children;
}
