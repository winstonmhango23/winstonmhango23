/**
 * Secure storage for auth token.
 * Expo Go uses AsyncStorage only — SecureStore has caused launch crashes on some devices.
 */

import { shouldUseNativeSecureStorage } from '@/lib/runtime-environment';

const AUTH_KEY = 'cofi_auth';

export interface StoredAuth {
  token: string;
  refreshToken?: string;
  /** online = server-validated; offline = local credential replica */
  sessionMode?: 'online' | 'offline';
  lastOnlineValidatedAt?: string;
  pendingServerValidation?: boolean;
  user: {
    id: number;
    email: string;
    fullName?: string;
    full_name?: string;
    role: string;
    phoneNumber?: string;
    phone_number?: string;
    employeeId?: string;
    employee_id?: string;
    branchId?: number;
    branch_id?: number;
    bankId?: number;
    bank_id?: number;
    is_group_admin?: boolean;
    isGroupAdmin?: boolean;
  };
}

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

async function deleteRaw(key: string): Promise<void> {
  if (!shouldUseNativeSecureStorage()) {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem(key);
    return;
  }
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  } catch {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem(key);
  }
}

export async function getStoredAuth(): Promise<StoredAuth | null> {
  try {
    const json = await readRaw(AUTH_KEY);
    if (!json) return null;
    return JSON.parse(json) as StoredAuth;
  } catch {
    return null;
  }
}

export async function setStoredAuth(auth: StoredAuth): Promise<void> {
  const json = JSON.stringify(auth);
  try {
    await writeRaw(AUTH_KEY, json);
  } catch {
    // Ignore
  }
}

export async function clearStoredAuth(): Promise<void> {
  try {
    await deleteRaw(AUTH_KEY);
  } catch {
    // Ignore
  }
}
