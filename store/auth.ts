/**
 * Auth store – user session and role.
 * Production: secure token persistence with online-first validation.
 * - Hydrates from SecureStore on cold start (works offline for restore only)
 * - Online-first validation when a data link is available
 * - Offline credential replica is a last-resort sign-in path only
 */

import { logger } from '@/lib/logger';
import { normalizeAuthUser } from '@/lib/auth-user';
import {
  clearAuthSession,
  persistAuthSession,
  readAuthSession,
} from '@/lib/auth-persistence';
import { parseSessionMetadata, validateAndRefreshSession } from '@/lib/offline-auth/session-validator';
import type { SessionMode } from '@/lib/offline-auth/types';
import { networkManager } from '@/lib/network-manager';
import { isExpoGo, isExpoGoCompatMode } from '@/lib/runtime-environment';
import { create } from 'zustand';

export type UserRole = 'client' | 'staff';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  phoneNumber?: string;
  clientId?: string;
  employeeId?: string;
  branchId?: number;
  bankId?: number;
  backendRole?: string;
  creditBook?: string;
  isGroupAdmin?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  role: UserRole | null;
  /** Permission codes as `module:action` from GET /permissions/me */
  permissions: string[];
  permissionsLoaded: boolean;
  hydrated: boolean;
  sessionMode: SessionMode | null;
  lastOnlineValidatedAt: string | null;
  pendingServerValidation: boolean;
  /** Bumped on every logout so in-flight setAuth calls cannot resurrect the session. */
  sessionGeneration: number;
  /** Epoch ms when the current session was established (login / setAuth). */
  authenticatedAt: number | null;
  login: (email: string, password: string) => Promise<{ success: boolean; role: UserRole }>;
  logout: () => Promise<void>;
  setAuth: (user: AuthUser, token: string, refreshToken?: string | null) => Promise<void>;
  hydrate: () => Promise<void>;
  fetchPermissions: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  role: null,
  permissions: [],
  permissionsLoaded: false,
  hydrated: false,
  sessionMode: null,
  lastOnlineValidatedAt: null,
  pendingServerValidation: false,
  sessionGeneration: 0,
  authenticatedAt: null,

  hydrate: async () => {
    if (get().hydrated) return;
    logger.debug(
      `Auth hydrate starting (expoGo=${isExpoGo()}, compat=${isExpoGoCompatMode()})`,
      { module: 'auth' }
    );
    try {
      const { warmSharedAuthDatabase } = await import('@/lib/data/sqlite');
      void warmSharedAuthDatabase().catch(() => undefined);

      const stored = await readAuthSession();
      if (stored && stored.user && stored.token) {
        const user = normalizeAuthUser(stored.user, (stored.user.role as UserRole) ?? 'client');
        const meta = parseSessionMetadata(stored);

        const { activateAccountScope } = await import('@/lib/account-scope');
        await activateAccountScope({ role: user.role, id: user.id }, stored.token);

        set({
          user,
          token: stored.token,
          refreshToken: stored.refreshToken ?? null,
          role: user.role,
          sessionMode: meta.sessionMode,
          lastOnlineValidatedAt: meta.lastOnlineValidatedAt,
          pendingServerValidation: meta.pendingServerValidation,
          hydrated: true,
          authenticatedAt: Date.now(),
        });
        logger.info('Session restored from secure storage', {
          module: 'auth',
          userId: user.id,
        });

        const online = await networkManager.getIsOnline();
        if (online) {
          const result = await validateAndRefreshSession();
          if (result.valid) {
            logger.info('Stored session validated online after hydrate', {
              module: 'auth',
              userId: user.id,
            });
            // Re-bind scope fingerprint if token rotated during validation.
            const latest = get();
            if (latest.token && latest.user) {
              await activateAccountScope(
                { role: latest.user.role, id: latest.user.id },
                latest.token
              );
            }
            void import('@/lib/loan-products/loan-products-cache').then((m) =>
              m.prefetchLoanProductsForCurrentUser()
            );
          } else if (result.reason === 'unauthorized' || result.reason === 'expired') {
            const pending = await import('@/lib/sync/sync-service')
              .then((m) => m.getPendingSyncCount())
              .catch(() => 0);
            if (pending > 0) {
              logger.warn(
                `Keeping session after failed online validation (${result.reason}) — pending sync`,
                { module: 'auth', userId: user.id }
              );
            } else {
              logger.warn(`Session cleared after failed online validation (${result.reason})`, {
                module: 'auth',
                userId: user.id,
              });
              await get().logout();
            }
          }
        }
      } else {
        logger.debug('No stored session found', { module: 'auth' });
        const { clearActiveAccountScope } = await import('@/lib/account-scope');
        await clearActiveAccountScope();
        set({ hydrated: true });
      }
    } catch (error) {
      logger.error(
        'Failed to hydrate auth store',
        error instanceof Error ? error : new Error(String(error)),
        { module: 'auth' }
      );
      set({ hydrated: true });
    }
  },

  login: async () => {
    return { success: false, role: 'client' as UserRole };
  },

  logout: async () => {
    const userId = get().user?.id;
    // Invalidate in-memory session first so UI/guards react immediately and
    // concurrent setAuth calls from profile fetches cannot win the race.
    set((s) => ({
      user: null,
      token: null,
      refreshToken: null,
      role: null,
      permissions: [],
      permissionsLoaded: false,
      sessionMode: null,
      lastOnlineValidatedAt: null,
      pendingServerValidation: false,
      sessionGeneration: s.sessionGeneration + 1,
      authenticatedAt: null,
    }));
    await clearAuthSession();
    try {
      const { clearActiveAccountScope, resetAccountScopedMemoryStores } = await import(
        '@/lib/account-scope'
      );
      await clearActiveAccountScope();
      await resetAccountScopedMemoryStores();
    } catch {
      logger.debug('Account scope cleanup skipped', { module: 'auth' });
    }
    // Keep offline credential replicas on device so other saved accounts can
    // still sign in offline — do not wipe the shared auth table on logout.
    logger.info('User logged out', { module: 'auth', userId });
  },

  setAuth: async (user, token, refreshToken) => {
    const generationAtStart = get().sessionGeneration;
    const previous = get().user;
    const effectiveRefreshToken = refreshToken ?? get().refreshToken ?? null;
    const sessionMode = get().sessionMode ?? 'online';
    const lastOnlineValidatedAt = get().lastOnlineValidatedAt;
    const pendingServerValidation = get().pendingServerValidation;
    const normalizedUser = normalizeAuthUser(user, user.role === 'staff' ? 'staff' : 'client');

    const switchingAccount =
      !!previous &&
      (previous.id !== normalizedUser.id || previous.role !== normalizedUser.role);

    if (switchingAccount) {
      const { resetAccountScopedMemoryStores } = await import('@/lib/account-scope');
      await resetAccountScopedMemoryStores();
    }

    const { activateAccountScope } = await import('@/lib/account-scope');
    await activateAccountScope(
      { role: normalizedUser.role, id: normalizedUser.id },
      token
    );

    const payload = {
      user: {
        ...normalizedUser,
        role: normalizedUser.role,
        is_group_admin: normalizedUser.isGroupAdmin ?? false,
      },
      token,
      refreshToken: effectiveRefreshToken ?? undefined,
      sessionMode,
      lastOnlineValidatedAt: lastOnlineValidatedAt ?? undefined,
      pendingServerValidation,
    };

    try {
      await persistAuthSession(payload);
    } catch (error) {
      logger.error(
        'Failed to persist auth session',
        error instanceof Error ? error : new Error(String(error)),
        { module: 'auth', userId: normalizedUser.id }
      );
      throw error;
    }

    // Logout ran while we were persisting — undo storage write and abort.
    if (get().sessionGeneration !== generationAtStart) {
      await clearAuthSession();
      const { clearActiveAccountScope } = await import('@/lib/account-scope');
      await clearActiveAccountScope();
      logger.debug('Discarded setAuth after logout', {
        module: 'auth',
        userId: normalizedUser.id,
      });
      return;
    }

    set({
      user: normalizedUser,
      token,
      refreshToken: effectiveRefreshToken,
      role: normalizedUser.role,
      sessionMode,
      lastOnlineValidatedAt,
      pendingServerValidation,
      authenticatedAt: Date.now(),
    });
    logger.info('User authenticated', {
      module: 'auth',
      userId: normalizedUser.id,
    });
    if (normalizedUser.role === 'staff') {
      void import('@/lib/loan-products/loan-products-cache').then((m) =>
        m.prefetchLoanProductsForCurrentUser()
      );
    }
  },

  fetchPermissions: async () => {
    const token = get().token;
    const role = get().user?.role;
    if (!token || role !== 'staff') {
      set({ permissions: [], permissionsLoaded: true });
      return;
    }
    try {
      const { apiGetMyPermissions } = await import('@/lib/data/api');
      const rows = await apiGetMyPermissions(token);
      const codes = rows
        .map((p) => {
          if (p.module && p.action) return `${p.module}:${p.action}`;
          return typeof p.name === 'string' ? p.name : '';
        })
        .filter(Boolean);
      set({ permissions: codes, permissionsLoaded: true });
    } catch {
      set({ permissions: [], permissionsLoaded: true });
    }
  },

  hasPermission: (permission) => {
    const { permissions, user } = get();
    if (!permission) return true;
    const backendRole = (user?.backendRole ?? '').toUpperCase();
    if (backendRole === 'SUPER_ADMIN' || backendRole === 'ADMIN') return true;
    return permissions.includes(permission);
  },
}));
