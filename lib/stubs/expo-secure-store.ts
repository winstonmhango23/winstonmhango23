/**
 * AsyncStorage-backed SecureStore stub for Expo Go / EXPO_PUBLIC_EXPO_GO_COMPAT.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getItemAsync(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
