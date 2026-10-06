/**
 * Device-bound secret for offline credential verifiers.
 * Stored in SecureStore (native) or AsyncStorage (Expo Go compat).
 */

import { shouldUseNativeSecureStorage } from '@/lib/runtime-environment';
import { DEVICE_SECRET_KEY } from '@/lib/offline-auth/constants';

async function readRaw(key: string): Promise<string | null> {
  if (!shouldUseNativeSecureStorage()) {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return AsyncStorage.getItem(key);
  }
  try {
    const SecureStore = await import('expo-secure-store');
    return SecureStore.getItemAsync(key);
  } catch {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return AsyncStorage.getItem(key);
  }
}

async function writeRaw(key: string, value: string): Promise<void> {
  if (!shouldUseNativeSecureStorage()) {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(key, value);
    return;
  }
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
  } catch {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(key, value);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Returns a stable per-device secret used only for offline password verification. */
export async function getDeviceSecret(): Promise<string> {
  const existing = await readRaw(DEVICE_SECRET_KEY);
  if (existing) return existing;

  const Crypto = await import('expo-crypto');
  const random = await Crypto.getRandomBytesAsync(32);
  const secret = bytesToHex(random);
  await writeRaw(DEVICE_SECRET_KEY, secret);
  return secret;
}
