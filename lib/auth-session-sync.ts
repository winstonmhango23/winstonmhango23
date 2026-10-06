/**
 * Keeps Zustand auth state and secure storage in sync (client sessions often
 * update in-memory via mobile session bootstrap before storage is written).
 */

import { normalizeAuthUser } from '@/lib/auth-user';
import { persistAuthSession } from '@/lib/auth-persistence';
import { getStoredAuth } from '@/lib/storage';
import type { UserRole } from '@/store/auth';
import { useAuthStore } from '@/store/auth';

export async function ensureAuthPersistedFromStore(): Promise<void> {
  const state = useAuthStore.getState();
  const token = state.token?.trim();
  const user = state.user;
  if (!token || !user) return;

  const stored = await getStoredAuth();
  if (stored?.token === token && stored.user?.email === user.email) return;

  await persistAuthSession({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as UserRole,
      phoneNumber: user.phoneNumber,
      employeeId: user.employeeId,
      branchId: user.branchId,
      bankId: user.bankId,
      is_group_admin: user.isGroupAdmin ?? false,
    },
    token,
    refreshToken: state.refreshToken ?? stored?.refreshToken,
    sessionMode: state.sessionMode ?? stored?.sessionMode ?? 'online',
    lastOnlineValidatedAt: state.lastOnlineValidatedAt ?? stored?.lastOnlineValidatedAt,
    pendingServerValidation:
      state.pendingServerValidation ?? stored?.pendingServerValidation ?? false,
  });
}

export function readLiveAuthCredentials(): { token: string | null; hasUser: boolean } {
  const state = useAuthStore.getState();
  const token = state.token?.trim() || null;
  return { token, hasUser: Boolean(state.user) };
}

export function hydrateStoreFromStoredAuthRecord(
  auth: NonNullable<Awaited<ReturnType<typeof getStoredAuth>>>
): string {
  if (auth.user) {
    const user = normalizeAuthUser(auth.user, (auth.user.role as UserRole) ?? 'client');
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
