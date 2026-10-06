/**
 * Validates stored JWT when network is available.
 * Online-first: refresh token → profile/me; invalidates session only on definitive 401.
 */

import { ensureAuthPersistedFromStore } from '@/lib/auth-session-sync';
import { config } from '@/lib/config';
import { persistAuthSession, readAuthSession } from '@/lib/auth-persistence';
import { logger } from '@/lib/logger';
import { networkManager } from '@/lib/network-manager';
import { clearPendingServerValidation } from '@/lib/offline-auth/credential-store';
import { OFFLINE_SESSION_MAX_DAYS } from '@/lib/offline-auth/constants';
import type { SessionMetadata, SessionMode, SessionValidationResult } from '@/lib/offline-auth/types';
import { normalizeAuthUser } from '@/lib/auth-user';
import type { AuthUser, UserRole } from '@/store/auth';
import { useAuthStore } from '@/store/auth';

export function parseSessionMetadata(
  stored: Awaited<ReturnType<typeof readAuthSession>>
): SessionMetadata {
  return {
    sessionMode: (stored?.sessionMode as SessionMode) ?? 'online',
    lastOnlineValidatedAt: stored?.lastOnlineValidatedAt ?? null,
    pendingServerValidation: stored?.pendingServerValidation ?? false,
  };
}

export function isOfflineSessionExpired(lastOnlineValidatedAt: string | null): boolean {
  if (!lastOnlineValidatedAt) return true;
  const last = new Date(lastOnlineValidatedAt).getTime();
  if (Number.isNaN(last)) return true;
  const maxMs = OFFLINE_SESSION_MAX_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - last > maxMs;
}

async function resolveRefreshToken(): Promise<string | null> {
  const stored = await readAuthSession();
  return stored?.refreshToken ?? useAuthStore.getState().refreshToken ?? null;
}

async function refreshTokensOnline(role: UserRole): Promise<{
  accessToken: string;
  refreshToken: string | null;
} | null> {
  const refreshToken = await resolveRefreshToken();
  if (!refreshToken) return null;

  const refreshUrl =
    role === 'client' ? config.clientAuth.refresh : config.staffAuth.refresh;

  try {
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshToken}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      logger.warn(`Session refresh failed (${response.status})`, { module: 'session-validator' });
      return null;
    }

    const data = (await response.json()) as {
      access_token?: string;
      token?: string;
      refresh_token?: string;
    };
    const accessToken = data.access_token ?? data.token;
    if (!accessToken) return null;

    return {
      accessToken,
      refreshToken: data.refresh_token ?? refreshToken,
    };
  } catch (error) {
    logger.error(
      'Session refresh request failed',
      error instanceof Error ? error : new Error(String(error)),
      { module: 'session-validator' }
    );
    return null;
  }
}

async function refreshStaffProfile(token: string, user: AuthUser): Promise<AuthUser | null> {
  try {
    const apiModule = await import('@/lib/data/api');
    const me = await apiModule.apiGetStaffProfile(token);
    if (me?.id == null) return null;
    return {
      ...user,
      id: me.id ?? user.id,
      email: me.email ?? user.email,
      fullName: me.full_name ?? user.fullName,
      employeeId: me.employee_id ?? user.employeeId,
      branchId: me.branch_id ?? user.branchId,
      bankId: me.bank_id ?? user.bankId,
      backendRole: me.role,
      creditBook: typeof me.credit_book === 'string' ? me.credit_book : user.creditBook,
    };
  } catch {
    return null;
  }
}

async function refreshClientProfile(token: string, user: AuthUser): Promise<AuthUser | null> {
  try {
    const apiModule = await import('@/lib/data/api');
    const { fetchMobileSession } = await import('@/lib/client-portal/api');
    const { applyMobileSessionToAuth } = await import('@/lib/client-portal/session-auth');
    const { useClientSessionStore } = await import('@/store/client-session');
    const [session, profile] = await Promise.all([
      fetchMobileSession(token),
      apiModule.apiGetCustomerProfile(token).catch(() => null),
    ]);
    useClientSessionStore.getState().setSession(session);
    await applyMobileSessionToAuth(session, token);

    const current = useAuthStore.getState().user ?? user;
    if (!profile) return current;

    return {
      ...current,
      id: profile.client_id ?? session.client_id ?? current.id,
      email: profile.email?.trim() || current.email,
      fullName:
        profile.full_name?.trim() || session.full_name?.trim() || current.fullName,
      phoneNumber: profile.phone_number ?? current.phoneNumber,
    };
  } catch {
    return null;
  }
}

async function resolveSessionCredentials(): Promise<{
  user: AuthUser;
  token: string;
  refreshToken: string | null;
  meta: SessionMetadata;
} | null> {
  await ensureAuthPersistedFromStore();
  const stored = await readAuthSession();
  if (stored?.token && stored.user) {
    return {
      user: normalizeAuthUser(stored.user, (stored.user.role as UserRole) ?? 'client'),
      token: stored.token,
      refreshToken: stored.refreshToken ?? null,
      meta: parseSessionMetadata(stored),
    };
  }
  const state = useAuthStore.getState();
  if (state.token && state.user) {
    return {
      user: state.user,
      token: state.token,
      refreshToken: state.refreshToken,
      meta: {
        sessionMode: state.sessionMode ?? 'online',
        lastOnlineValidatedAt: state.lastOnlineValidatedAt,
        pendingServerValidation: state.pendingServerValidation,
      },
    };
  }
  return null;
}

/** Attempt online validation + profile refresh. Safe to call on reconnect. */
export async function validateAndRefreshSession(): Promise<SessionValidationResult> {
  const online = await networkManager.getIsOnline();
  const credentials = await resolveSessionCredentials();

  if (!credentials) {
    return { valid: false, reason: 'no_session' };
  }

  const { user, meta } = credentials;
  let token = credentials.token;
  let refreshToken = credentials.refreshToken;

  if (!online) {
    if (meta.sessionMode === 'offline' && isOfflineSessionExpired(meta.lastOnlineValidatedAt)) {
      return { valid: false, reason: 'expired' };
    }
    return { valid: false, reason: 'offline' };
  }

  const refreshed = await refreshTokensOnline(user.role);
  if (refreshed) {
    token = refreshed.accessToken;
    refreshToken = refreshed.refreshToken;
  } else {
    // Probe current access token with profile endpoint
    const probeUrl =
      user.role === 'staff' ? config.staffAuth.me : config.mobile.session;
    try {
      const probe = await fetch(probeUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (probe.status === 401) {
        return { valid: false, reason: 'unauthorized' };
      }
    } catch {
      // Transient network — keep offline session
      return { valid: false, reason: 'offline' };
    }
  }

  const updatedUser =
    user.role === 'staff'
      ? (await refreshStaffProfile(token, user)) ?? user
      : (await refreshClientProfile(token, user)) ?? user;

  const now = new Date().toISOString();
  await persistAuthSession({
    user: { ...updatedUser, role: updatedUser.role },
    token,
    refreshToken: refreshToken ?? undefined,
    sessionMode: 'online',
    lastOnlineValidatedAt: now,
    pendingServerValidation: false,
  });

  useAuthStore.setState({
    user: updatedUser,
    token,
    refreshToken,
    role: updatedUser.role,
    sessionMode: 'online',
    lastOnlineValidatedAt: now,
    pendingServerValidation: false,
  });

  if (updatedUser.email) {
    await clearPendingServerValidation(updatedUser.email).catch(() => {});
  }

  logger.info('Session validated online', {
    module: 'session-validator',
    userId: updatedUser.id,
  });

  return { valid: true, mode: 'online' };
}

async function hasPendingSyncWork(): Promise<boolean> {
  try {
    const { getPendingSyncCount } = await import('@/lib/sync/sync-service');
    return (await getPendingSyncCount()) > 0;
  } catch {
    return false;
  }
}

/** Called when reconnecting — invalidates session only on hard auth failure. */
export async function validateSessionOnReconnect(): Promise<void> {
  const { token, user } = useAuthStore.getState();
  if (!token || !user) return;

  const result = await validateAndRefreshSession();
  if (result.valid) return;

  if (result.reason === 'unauthorized' || result.reason === 'expired') {
    if (await hasPendingSyncWork()) {
      logger.warn(`Keeping session on reconnect (${result.reason}) — pending sync`, {
        module: 'session-validator',
        userId: user.id,
      });
      return;
    }
    const { authenticatedAt } = useAuthStore.getState();
    if (authenticatedAt && Date.now() - authenticatedAt < 20_000) {
      logger.warn(`Keeping session on reconnect (${result.reason}) — post-login grace`, {
        module: 'session-validator',
        userId: user.id,
      });
      return;
    }
    logger.warn(`Session invalidated on reconnect (${result.reason})`, {
      module: 'session-validator',
      userId: user.id,
    });
    await useAuthStore.getState().logout();
  }
}
