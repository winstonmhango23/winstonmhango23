/**
 * Simple offline cache for API responses.
 * Account-scoped so switching users cannot read another account's cache.
 */

import { scopedGetItemOptional, scopedSetItem } from '@/lib/account-scope';
import { logger } from '@/lib/logger';

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const LOGICAL_PREFIX = 'cache_';

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await scopedGetItemOptional(LOGICAL_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > TTL_MS) {
      logger.debug(`Cache expired for ${key}`, { module: 'cache' });
      return null;
    }
    logger.debug(`Cache hit for ${key}`, { module: 'cache' });
    return data as T;
  } catch (error) {
    logger.error(
      `Failed to read cache for ${key}`,
      error instanceof Error ? error : new Error(String(error)),
      { module: 'cache' }
    );
    return null;
  }
}

export async function setCached(key: string, data: unknown): Promise<void> {
  try {
    await scopedSetItem(LOGICAL_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
    logger.debug(`Cached ${key}`, { module: 'cache' });
  } catch (error) {
    logger.error(
      `Failed to cache ${key}`,
      error instanceof Error ? error : new Error(String(error)),
      { module: 'cache' }
    );
  }
}

export function isNetworkError(e: unknown): boolean {
  if (e && typeof e === 'object') {
    const err = e as { name?: string; status?: number; message?: string };
    if (err.name === 'ApiClientError') {
      // Transport / unreachable host often surfaces as status 0.
      if (err.status === 0) return true;
      // Client abort / RN timeout mapped to 408.
      if (err.status === 408) return true;
      // Transient gateway failures — safe to retry then fall back offline.
      if (err.status === 502 || err.status === 503 || err.status === 504) return true;
    }
  }
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    const name = (e.name || '').toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('socket') ||
      msg.includes('unreachable') ||
      msg.includes('offline') ||
      name.includes('abort')
    );
  }
  return false;
}
