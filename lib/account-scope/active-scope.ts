/**
 * Active account scope — switches SQLite + KV namespaces on login / hydrate.
 */

import {
  buildAccountScopeId,
  fingerprintAccessToken,
  normalizeAccountRole,
} from '@/lib/account-scope/ids';
import type { AccountPrincipal, ActiveAccountScope } from '@/lib/account-scope/types';
import { ACTIVE_SCOPE_META_KEY } from '@/lib/account-scope/types';
import { logger } from '@/lib/logger';

let active: ActiveAccountScope | null = null;
let activatePromise: Promise<ActiveAccountScope> | null = null;

async function readRaw(key: string): Promise<string | null> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  return AsyncStorage.getItem(key);
}

async function writeRaw(key: string, value: string): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.setItem(key, value);
}

async function deleteRaw(key: string): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.removeItem(key);
}

export function getActiveAccountScope(): ActiveAccountScope | null {
  return active;
}

export function getActiveAccountScopeId(): string | null {
  return active?.scopeId ?? null;
}

export function requireActiveAccountScopeId(): string {
  if (!active?.scopeId) {
    throw new Error('No active account scope — sign in before accessing local app data');
  }
  return active.scopeId;
}

/**
 * Bind local storage to this principal. Closes any previous account DB when the
 * scope changes so the next open targets the correct file.
 */
export async function activateAccountScope(
  principal: AccountPrincipal,
  accessToken: string
): Promise<ActiveAccountScope> {
  if (activatePromise) return activatePromise;

  activatePromise = (async () => {
    const scopeId = buildAccountScopeId({
      role: normalizeAccountRole(principal.role),
      id: principal.id,
    });
    const tokenFingerprint = await fingerprintAccessToken(accessToken);
    const next: ActiveAccountScope = {
      scopeId,
      role: normalizeAccountRole(principal.role),
      userId: Math.trunc(principal.id),
      tokenFingerprint,
      activatedAt: new Date().toISOString(),
    };

    const prevScope = active?.scopeId ?? null;
    if (prevScope && prevScope !== next.scopeId) {
      const { releaseAppDatabase } = await import('@/lib/data/sqlite');
      await releaseAppDatabase();
      logger.info(`Account scope switched ${prevScope} → ${next.scopeId}`, {
        module: 'account-scope',
      });
    }

    active = next;
    try {
      await writeRaw(ACTIVE_SCOPE_META_KEY, JSON.stringify(next));
    } catch {
      /* meta is best-effort */
    }

    logger.info(`Account scope active ${next.scopeId} (tokenFp=${next.tokenFingerprint})`, {
      module: 'account-scope',
      userId: next.userId,
    });
    return next;
  })().finally(() => {
    activatePromise = null;
  });

  return activatePromise;
}

/** Clear active namespace (logout). Does not delete per-account DBs on disk. */
export async function clearActiveAccountScope(): Promise<void> {
  const prev = active?.scopeId;
  active = null;
  try {
    const { releaseAppDatabase } = await import('@/lib/data/sqlite');
    await releaseAppDatabase();
  } catch {
    /* ignore */
  }
  try {
    await deleteRaw(ACTIVE_SCOPE_META_KEY);
  } catch {
    /* ignore */
  }
  if (prev) {
    logger.info(`Account scope cleared (was ${prev})`, { module: 'account-scope' });
  }
}

/** Restore meta from disk if process memory was lost (rarely needed). */
export async function restoreActiveAccountScopeMeta(): Promise<ActiveAccountScope | null> {
  if (active) return active;
  try {
    const raw = await readRaw(ACTIVE_SCOPE_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveAccountScope;
    if (parsed?.scopeId && parsed.userId) {
      active = parsed;
      return active;
    }
  } catch {
    /* ignore */
  }
  return null;
}
