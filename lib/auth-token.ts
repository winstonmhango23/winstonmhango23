/**
 * Central auth token resolution for data layer and modals.
 * Prefers live Zustand session, falls back to secure storage, waits for hydration.
 */

import {
  ensureAuthPersistedFromStore,
  hydrateStoreFromStoredAuthRecord,
} from '@/lib/auth-session-sync';
import { normalizeAuthUser } from '@/lib/auth-user';
import { getStoredAuth } from '@/lib/storage';
import { networkManager } from '@/lib/network-manager';
import { validateAndRefreshSession } from '@/lib/offline-auth/session-validator';
import { useAuthStore } from '@/store/auth';

const HYDRATE_WAIT_MS = 4000;
const HYDRATE_POLL_MS = 40;

export async function waitForAuthHydration(): Promise<void> {
  const deadline = Date.now() + HYDRATE_WAIT_MS;
  while (!useAuthStore.getState().hydrated && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, HYDRATE_POLL_MS));
  }
  if (!useAuthStore.getState().hydrated) {
    await useAuthStore.getState().hydrate();
  }
}

function storedUserToAuthUser(
  raw: NonNullable<Awaited<ReturnType<typeof getStoredAuth>>>['user']
) {
  return normalizeAuthUser(raw, (raw.role as 'client' | 'staff') ?? 'client');
}

/** Returns a bearer token or throws if no session exists. */
export async function getAuthToken(): Promise<string> {
  await waitForAuthHydration();

  const live = useAuthStore.getState().token;
  if (live) return live;

  const auth = await getStoredAuth();
  if (auth?.token) {
    return hydrateStoreFromStoredAuth(auth);
  }

  throw new Error('Not authenticated');
}

/** Non-throwing token lookup for UI gates. */
export async function tryGetAuthToken(): Promise<string | null> {
  try {
    return await getAuthToken();
  } catch {
    return null;
  }
}

function hydrateStoreFromStoredAuth(
  auth: NonNullable<Awaited<ReturnType<typeof getStoredAuth>>>
): string {
  if (auth.user) {
    const user = storedUserToAuthUser(auth.user);
    useAuthStore.setState({
      user,
      token: auth.token,
      refreshToken: auth.refreshToken ?? null,
      role: user.role,
      sessionMode: auth.sessionMode ?? useAuthStore.getState().sessionMode ?? 'online',
      lastOnlineValidatedAt:
        auth.lastOnlineValidatedAt ?? useAuthStore.getState().lastOnlineValidatedAt,
      pendingServerValidation:
        auth.pendingServerValidation ?? useAuthStore.getState().pendingServerValidation,
      hydrated: true,
    });
  } else {
    useAuthStore.setState({
      token: auth.token,
      refreshToken: auth.refreshToken ?? null,
      hydrated: true,
    });
  }
  return auth.token;
}

/**
 * Token for background sync — persists in-memory session, refreshes when online,
 * but still returns the live token if refresh fails so sync can surface API errors
 * instead of falsely reporting "session ended".
 */
export async function resolveAuthTokenForSync(): Promise<string | null> {
  await waitForAuthHydration();
  await ensureAuthPersistedFromStore();

  // Prefer live token immediately so sync does not wait on slow validation.
  const liveBefore = useAuthStore.getState().token?.trim();
  if (liveBefore) {
    const online = await networkManager.getIsOnline();
    if (online) {
      // Refresh in background-friendly way; keep live token if refresh fails.
      await validateAndRefreshSession().catch(() => undefined);
      const refreshed = useAuthStore.getState().token?.trim();
      if (refreshed) return refreshed;
    }
    return liveBefore;
  }

  const auth = await getStoredAuth();
  if (auth?.token?.trim()) {
    const restored = hydrateStoreFromStoredAuthRecord(auth).trim();
    const online = await networkManager.getIsOnline();
    if (online) {
      await validateAndRefreshSession().catch(() => undefined);
      const refreshed = useAuthStore.getState().token?.trim();
      if (refreshed) return refreshed;
    }
    return restored;
  }

  return null;
}
