import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { patientPortalService } from '@/src/services/patient-portal';

const PUSH_TOKEN_KEY = 'patient_portal_expo_push_token';
const ANDROID_CHANNEL_ID = 'visit-admission';
let registrationQueue: Promise<void> = Promise.resolve();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function hasNotificationPermission(
  permissions: Notifications.NotificationPermissionsStatus,
) {
  if (Platform.OS === 'ios' && permissions.ios) {
    return [
      Notifications.IosAuthorizationStatus.AUTHORIZED,
      Notifications.IosAuthorizationStatus.PROVISIONAL,
      Notifications.IosAuthorizationStatus.EPHEMERAL,
    ].includes(permissions.ios.status);
  }

  return permissions.granted;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Visit admission',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
  });
}

function getProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId
    ?? null;
}

async function getPermission() {
  const existing = await Notifications.getPermissionsAsync();
  if (hasNotificationPermission(existing)) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return hasNotificationPermission(requested);
}

async function registerPatientPushNotificationsNow(
  authToken: string,
  devicePushToken?: Notifications.DevicePushToken,
) {
  if (
    Platform.OS === 'web'
    || !Device.isDevice
    || !authToken
  ) {
    return;
  }

  await ensureAndroidChannel();

  if (!(await getPermission())) {
    return;
  }

  const projectId = getProjectId();
  if (!projectId) {
    return;
  }

  const expoPushToken = (
    await Notifications.getExpoPushTokenAsync({
      projectId,
      ...(devicePushToken ? { devicePushToken } : {}),
    })
  ).data;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const previousToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);

  await patientPortalService.registerPushToken(
    { token: expoPushToken, platform },
    authToken,
  );

  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, expoPushToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  if (previousToken && previousToken !== expoPushToken) {
    try {
      await patientPortalService.unregisterPushToken(previousToken, authToken);
    } catch {
      // The new token is already registered. Stale-token cleanup is best effort.
    }
  }
}

export function registerPatientPushNotifications(
  authToken: string,
  devicePushToken?: Notifications.DevicePushToken,
) {
  const registration = registrationQueue.then(() =>
    registerPatientPushNotificationsNow(authToken, devicePushToken));
  registrationQueue = registration.catch(() => undefined);
  return registration;
}

export async function unregisterPatientPushNotifications(authToken: string) {
  await registrationQueue;

  const expoPushToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  if (!expoPushToken) {
    return;
  }

  try {
    await patientPortalService.unregisterPushToken(expoPushToken, authToken);
  } finally {
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  }
}

export function addPatientPushTokenListener(
  onTokenChanged: (
    token: Notifications.DevicePushToken,
  ) => void | Promise<void>,
) {
  return Notifications.addPushTokenListener((token) => {
    void onTokenChanged(token);
  });
}
