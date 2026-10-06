/**
 * Retry helper for online-first writes.
 * Attempts the remote operation up to maxAttempts with exponential backoff;
 * only callers should fall back to SQLite after all network failures.
 */

import { logger } from '@/lib/logger';
import { isNetworkError } from '@/lib/cache';

export type NetworkRetryOptions = {
  maxAttempts?: number;
  /** Base delay in ms; attempt n waits base * 2^(n-1). */
  baseDelayMs?: number;
  label?: string;
  /** Called before each attempt (1-based). */
  onAttempt?: (attempt: number, maxAttempts: number) => void;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const LOGIN_RETRY_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` up to maxAttempts times.
 * Non-network errors are rethrown immediately (no silent offline fallback).
 * After exhausting network failures, rethrows the last network error.
 */
export async function retryNetworkOperation<T>(
  fn: () => Promise<T>,
  opts: NetworkRetryOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const label = opts.label ?? 'network-op';

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    opts.onAttempt?.(attempt, maxAttempts);
    try {
      const result = await fn();
      if (attempt > 1) {
        logger.info(`${label} succeeded on attempt ${attempt}/${maxAttempts}`, {
          module: 'network-retry',
        });
      }
      return result;
    } catch (e) {
      lastError = e;
      if (!isNetworkError(e)) {
        throw e;
      }
      logger.warn(
        `${label} network failure attempt ${attempt}/${maxAttempts}: ${
          e instanceof Error ? e.message : String(e)
        }`,
        { module: 'network-retry' }
      );
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed after ${maxAttempts} network attempts`);
}

export const APPLICATION_CREATE_MAX_ATTEMPTS = DEFAULT_MAX_ATTEMPTS;
export const LOGIN_MAX_ATTEMPTS = LOGIN_RETRY_MAX_ATTEMPTS;
