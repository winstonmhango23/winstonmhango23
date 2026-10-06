/**
 * Pure session permission gates for borrower group portal flows.
 * Mirrors web client-portal + backCFAPi group permission checks.
 * Kept free of store imports so unit tests can run without SQLite.
 */

import type { MobileClientSessionContext } from '@/lib/data/api';

/** Whether the client may use group-chair / parent profile edit flows. */
export function resolveIsGroupAdmin(session: MobileClientSessionContext): boolean {
  if (session.dashboard_mode === 'group_parent') return true;
  if (session.is_group_chairperson === true) return true;
  if (session.can_edit_group_origination === true) return true;
  return false;
}

/**
 * Whether the client can open the group members roster (list).
 * Matches API `list_group_members_accessible_by_actor` (roster | credentials | leaders)
 * and portal nav (roster | credentials). Does NOT grant access from repay-only alone —
 * that flag unlocked a list UI that then 403'd on GET /mobile/group/members.
 */
export function canViewGroupMembersRoster(
  session: MobileClientSessionContext | null | undefined
): boolean {
  if (!session) return false;
  return (
    session.dashboard_mode === 'group_parent' ||
    session.can_administer_group_roster === true ||
    session.can_manage_group_leaders === true ||
    session.can_provision_member_credentials === true
  );
}

/** Add / edit / deactivate members — mirrors portal `can_administer_group_roster`. */
export function canAdministerGroupRoster(
  session: MobileClientSessionContext | null | undefined
): boolean {
  return (
    session?.can_administer_group_roster === true || session?.dashboard_mode === 'group_parent'
  );
}

/**
 * Full member profile (`GET /mobile/group/members/{id}`) is roster-admin only.
 */
export function canViewGroupMemberProfile(
  session: MobileClientSessionContext | null | undefined
): boolean {
  return canAdministerGroupRoster(session);
}

/**
 * Member loans for repay-on-behalf (`GET .../members/{id}/loans`) —
 * requires `can_record_group_repayments` (API), with chairperson as a safety alias.
 */
export function canViewGroupMemberLoans(
  session: MobileClientSessionContext | null | undefined
): boolean {
  if (!session) return false;
  return (
    session.can_record_group_repayments === true || session.is_group_chairperson === true
  );
}

/** Record repayment on behalf of a group member (portal chairperson flow). */
export function canRecordGroupRepayments(
  session: MobileClientSessionContext | null | undefined
): boolean {
  return canViewGroupMemberLoans(session);
}

/**
 * Borrower apps must never activate / verify member accounts.
 * Staff / loan officers do this via PATCH /clients/{id}/verify.
 */
export function canProvisionGroupMemberCredentials(
  _session: MobileClientSessionContext | null | undefined
): boolean {
  return false;
}

/** Assign chair / secretary / treasurer / custom leaders — mirrors portal `can_manage_group_leaders`. */
export function canManageGroupLeaders(
  session: MobileClientSessionContext | null | undefined
): boolean {
  return session?.can_manage_group_leaders === true;
}
