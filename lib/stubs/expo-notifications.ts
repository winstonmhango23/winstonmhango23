/**
 * No-op stub for expo-notifications when EXPO_PUBLIC_EXPO_GO_COMPAT=true.
 * Prevents Expo Go (SDK 53+) from loading the real module at bundle time.
 */

export const AndroidImportance = {
  DEFAULT: 3,
  HIGH: 4,
  LOW: 2,
  MAX: 5,
  MIN: 1,
  NONE: 0,
  UNSPECIFIED: -1000,
};

export async function getPermissionsAsync() {
  return { status: 'denied' as const, granted: false, canAskAgain: true };
}

export async function requestPermissionsAsync() {
  return { status: 'denied' as const, granted: false, canAskAgain: true };
}

export async function getExpoPushTokenAsync() {
  return { data: '' };
}

export function setNotificationHandler() {}

export function addNotificationResponseReceivedListener() {
  return { remove: () => {} };
}

export function addNotificationReceivedListener() {
  return { remove: () => {} };
}

export function addPushTokenListener() {
  return { remove: () => {} };
}
