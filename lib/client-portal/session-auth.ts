/**
 * Apply mobile session flags to the auth store after login / navigation.
 */

import type { MobileClientSessionContext } from '@/lib/data/api';
import { useAuthStore } from '@/store/auth';
import { resolveIsGroupAdmin } from '@/lib/client-portal/session-gates';

export {
  resolveIsGroupAdmin,
  canViewGroupMembersRoster,
  canAdministerGroupRoster,
  canViewGroupMemberProfile,
  canViewGroupMemberLoans,
  canRecordGroupRepayments,
  canProvisionGroupMemberCredentials,
  canManageGroupLeaders,
} from '@/lib/client-portal/session-gates';

export async function applyMobileSessionToAuth(
  session: MobileClientSessionContext,
  token: string
): Promise<void> {
  const state = useAuthStore.getState();
  const u = state.user;
  // Never rewrite a staff session from borrower mobile-session payloads.
  if (u?.role === 'staff' || state.role === 'staff') {
    return;
  }

  const seed = u ?? {
    id: session.client_id,
    email: '',
    fullName: session.full_name?.trim() ?? '',
    role: 'client' as const,
  };

  const nextUser = {
    ...seed,
    role: 'client' as const,
    id: session.client_id ?? seed.id,
    fullName: session.full_name?.trim() || seed.fullName,
    isGroupAdmin: resolveIsGroupAdmin(session),
  };

  // Avoid rewriting auth (and cascading layout effects) when nothing changed.
  if (
    u &&
    state.token === token &&
    u.id === nextUser.id &&
    u.fullName === nextUser.fullName &&
    u.role === nextUser.role &&
    Boolean(u.isGroupAdmin) === Boolean(nextUser.isGroupAdmin)
  ) {
    return;
  }

  await state.setAuth(nextUser, token);
}
