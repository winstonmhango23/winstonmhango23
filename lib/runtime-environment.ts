/**
 * Runtime environment helpers (Expo Go vs dev build vs store build).
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';

/** Metro substitutes native-heavy modules when this is not explicitly false. */
export function isExpoGoCompatMode(): boolean {
  return process.env.EXPO_PUBLIC_EXPO_GO_COMPAT !== 'false';
}

/** True when running inside the Expo Go client. */
export function isExpoGo(): boolean {
  if (isRunningInExpoGo()) return true;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return true;
  if (Constants.appOwnership === 'expo') return true;
  return false;
}

/** Skip SecureStore on Expo Go and in compat dev sessions (Expo Go + mis-detection). */
export function shouldUseNativeSecureStorage(): boolean {
  if (isExpoGo()) return false;
  if (isExpoGoCompatMode()) return false;
  return true;
}

/** Push notifications are unavailable in Expo Go on Android (SDK 53+). */
export function isPushNotificationsAvailable(): boolean {
  if (isExpoGo() || isExpoGoCompatMode()) return false;
  return Device.isDevice;
}

/** Skip network monitor / performance init in lightweight dev sessions. */
export function shouldSkipProductionInit(): boolean {
  return isExpoGo() || isExpoGoCompatMode();
}
