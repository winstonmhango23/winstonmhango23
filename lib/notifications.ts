/**
 * Push notifications – expo-notifications setup.
 * Requests permissions, gets token, registers with backend.
 * Respects user's pushNotifications preference from profile store.
 *
 * The real expo-notifications package is never imported in Expo Go; Metro can
 * substitute a stub via EXPO_PUBLIC_EXPO_GO_COMPAT (default: true).
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { apiRegisterPushToken } from '@/lib/data/api';
import {
  isPushNotificationsAvailable,
} from '@/lib/runtime-environment';
import { getStoredAuth } from '@/lib/storage';

type NotificationsModule = typeof import('expo-notifications');

export type NotificationResponse = {
  notification: {
    request: {
      content: {
        data?: Record<string, unknown>;
      };
    };
  };
  actionIdentifier: string;
};

let notificationsModule: NotificationsModule | null | undefined;
let handlerConfigured = false;

export { isPushNotificationsAvailable } from '@/lib/runtime-environment';

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!isPushNotificationsAvailable()) return null;
  if (notificationsModule !== undefined) return notificationsModule;

  try {
    notificationsModule = await import('expo-notifications');
    if (!handlerConfigured) {
      notificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      handlerConfigured = true;
    }
  } catch {
    notificationsModule = null;
  }

  return notificationsModule;
}

/**
 * Request notification permissions. Returns true if granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Get the Expo push token. Requires physical device.
 */
export async function getExpoPushToken(): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  const granted = await requestNotificationPermissions();
  if (!granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData?.data ?? null;
}

/**
 * Register push token with backend. No-op when no auth token.
 */
export async function registerPushToken(pushToken: string): Promise<void> {
  const auth = await getStoredAuth();
  if (!auth?.token) return;
  try {
    await apiRegisterPushToken(auth.token, pushToken, Platform.OS);
  } catch {
    // Ignore
  }
}

/**
 * Setup push notifications: permissions, token, registration.
 * Call after user is logged in. Respects pushNotifications preference.
 */
export async function setupPushNotifications(pushEnabled: boolean): Promise<void> {
  if (!pushEnabled || !isPushNotificationsAvailable()) return;
  const token = await getExpoPushToken();
  if (token) {
    await registerPushToken(token);
  }
}

/**
 * Add listener for when user taps a notification.
 */
export function addNotificationResponseListener(
  callback: (response: NotificationResponse) => void
): () => void {
  if (!isPushNotificationsAvailable()) return () => {};

  let cancelled = false;
  let remove: (() => void) | undefined;

  void loadNotifications().then((Notifications) => {
    if (cancelled || !Notifications) return;
    const sub = Notifications.addNotificationResponseReceivedListener(callback);
    remove = () => sub.remove();
  });

  return () => {
    cancelled = true;
    remove?.();
  };
}

/**
 * Add listener for notifications received while app is foregrounded.
 */
export function addNotificationReceivedListener(
  callback: (notification: NotificationResponse['notification']) => void
): () => void {
  if (!isPushNotificationsAvailable()) return () => {};

  let cancelled = false;
  let remove: (() => void) | undefined;

  void loadNotifications().then((Notifications) => {
    if (cancelled || !Notifications) return;
    const sub = Notifications.addNotificationReceivedListener(callback);
    remove = () => sub.remove();
  });

  return () => {
    cancelled = true;
    remove?.();
  };
}
