/**
 * Account-scoped AsyncStorage helpers.
 * Keys become `cofi.a.{scopeId}.{logicalKey}`.
 */

import { scopedKvKey } from '@/lib/account-scope/ids';
import {
  getActiveAccountScopeId,
  requireActiveAccountScopeId,
} from '@/lib/account-scope/active-scope';

async function storage() {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  return AsyncStorage;
}

export async function scopedGetItem(logicalKey: string): Promise<string | null> {
  const scopeId = requireActiveAccountScopeId();
  return (await storage()).getItem(scopedKvKey(scopeId, logicalKey));
}

export async function scopedSetItem(logicalKey: string, value: string): Promise<void> {
  const scopeId = requireActiveAccountScopeId();
  await (await storage()).setItem(scopedKvKey(scopeId, logicalKey), value);
}

export async function scopedRemoveItem(logicalKey: string): Promise<void> {
  const scopeId = getActiveAccountScopeId();
  if (!scopeId) return;
  await (await storage()).removeItem(scopedKvKey(scopeId, logicalKey));
}

/** Read without throwing when logged out (returns null). */
export async function scopedGetItemOptional(logicalKey: string): Promise<string | null> {
  const scopeId = getActiveAccountScopeId();
  if (!scopeId) return null;
  return (await storage()).getItem(scopedKvKey(scopeId, logicalKey));
}
