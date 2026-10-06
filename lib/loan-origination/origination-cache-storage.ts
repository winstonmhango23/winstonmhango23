/**
 * AsyncStorage helpers for loan origination prefetch payloads (account-scoped).
 */

import { scopedGetItemOptional, scopedSetItem } from '@/lib/account-scope';

const LOGICAL_PREFIX = 'origination_';

export async function readOriginationCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await scopedGetItemOptional(LOGICAL_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; cached_at: string };
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export async function writeOriginationCache<T>(key: string, data: T): Promise<void> {
  try {
    await scopedSetItem(
      LOGICAL_PREFIX + key,
      JSON.stringify({ data, cached_at: new Date().toISOString() })
    );
  } catch {
    /* ignore */
  }
}

export function loanFormCacheKey(productId: number, clientId?: number): string {
  return clientId && clientId > 0
    ? `form_product_${productId}_client_${clientId}`
    : `form_product_${productId}`;
}

export function loanFormTypeCacheKey(formType: string, clientId?: number): string {
  const ft = formType.toUpperCase();
  return clientId && clientId > 0
    ? `form_type_${ft}_client_${clientId}`
    : `form_type_${ft}`;
}
