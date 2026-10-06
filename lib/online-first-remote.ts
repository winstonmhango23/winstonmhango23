/**
 * Shared online-first remote attempt helper (mirrors createApplication).
 * Uses OS data-link + retries; API /health probe must not block POST.
 */

import { isNetworkError } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { networkManager } from '@/lib/network-manager';
import {
  APPLICATION_CREATE_MAX_ATTEMPTS,
  retryNetworkOperation,
} from '@/lib/network-retry';

export type OnlineFirstRemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'no_link' | 'network_exhausted' };

/**
 * Attempt a remote operation when the OS reports a data link.
 * Retries transient network failures; rethrows validation/auth errors.
 */
export async function runOnlineFirstRemote<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number }
): Promise<OnlineFirstRemoteResult<T>> {
  await networkManager.forceRefresh();
  const hasLink = await networkManager.hasDataLink();
  if (!hasLink) {
    logger.info(`${label}: no OS data link; skipping remote attempt`, { module: 'online-first' });
    return { ok: false, reason: 'no_link' };
  }

  try {
    const value = await retryNetworkOperation(fn, {
      maxAttempts: opts?.maxAttempts ?? APPLICATION_CREATE_MAX_ATTEMPTS,
      label,
    });
    return { ok: true, value };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    logger.warn(
      `${label} exhausted remote attempts; caller may fall back offline: ${
        e instanceof Error ? e.message : String(e)
      }`,
      { module: 'online-first' }
    );
    return { ok: false, reason: 'network_exhausted' };
  }
}
