/**
 * Lazy auth session persistence — avoids Metro circular-import issues where
 * `import * as storage` can be undefined while store/auth is still initializing.
 */

import type { StoredAuth } from '@/lib/storage';

export type { StoredAuth };

async function loadAuthStorage() {
  const mod = await import('@/lib/storage');
  if (typeof mod.getStoredAuth !== 'function') {
    throw new Error('getStoredAuth is not available');
  }
  if (typeof mod.setStoredAuth !== 'function') {
    throw new Error('setStoredAuth is not available');
  }
  if (typeof mod.clearStoredAuth !== 'function') {
    throw new Error('clearStoredAuth is not available');
  }
  return mod;
}

export async function readAuthSession(): Promise<StoredAuth | null> {
  const storage = await loadAuthStorage();
  return storage.getStoredAuth();
}

export async function persistAuthSession(auth: StoredAuth): Promise<void> {
  const storage = await loadAuthStorage();
  await storage.setStoredAuth(auth);
}

export async function clearAuthSession(): Promise<void> {
  const storage = await loadAuthStorage();
  await storage.clearStoredAuth();
}
