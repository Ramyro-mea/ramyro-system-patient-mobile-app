import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { PropsWithChildren, useEffect, useRef } from 'react';

import { supportTicketIdFromNotificationData } from '@/src/lib/support-notifications';
import { useAuth } from '@/src/providers/auth-provider';
import {
  addPatientPushTokenListener,
  registerPatientPushNotifications,
} from '@/src/services/push-notifications';

export function NotificationProvider({ children }: PropsWithChildren) {
  const { status, token } = useAuth();
  const handledResponses = useRef(new Set<string>());

  useEffect(() => {
    if (status !== 'authenticated' || !token) {
      return;
    }

    let active = true;
    const syncToken = async (devicePushToken?: Notifications.DevicePushToken) => {
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

  useEffect(() => {
    if (status !== 'authenticated' || !token) return;
    let active = true;

    const openSupportResponse = async (response: Notifications.NotificationResponse | null) => {
      if (!active || !response) return;
      const ticketId = supportTicketIdFromNotificationData(
        response.notification.request.content.data,
      );
      if (!ticketId) return;
      const responseId = response.notification.request.identifier;
      if (handledResponses.current.has(responseId)) return;
      handledResponses.current.add(responseId);
      router.push({ pathname: '/(app)/support', params: { ticketId: String(ticketId) } });
      await Notifications.clearLastNotificationResponseAsync();
    };

    void Notifications.getLastNotificationResponseAsync().then(openSupportResponse);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => void openSupportResponse(response),
    );
    return () => {
      active = false;
      responseSubscription.remove();
    };
  }, [status, token]);

  return children;
}
