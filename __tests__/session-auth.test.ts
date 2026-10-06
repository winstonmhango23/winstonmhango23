import {
  canAdministerGroupRoster,
  canProvisionGroupMemberCredentials,
  canRecordGroupRepayments,
  canViewGroupMemberLoans,
  canViewGroupMemberProfile,
  canViewGroupMembersRoster,
  resolveIsGroupAdmin,
} from '@/lib/client-portal/session-gates';
import type { MobileClientSessionContext } from '@/lib/data/api';

function session(
  overrides: Partial<MobileClientSessionContext> = {}
): MobileClientSessionContext {
  return {
    client_id: 1,
    full_name: 'Test',
    dashboard_mode: 'individual',
    can_administer_group_roster: false,
    can_manage_group_leaders: false,
    can_provision_member_credentials: false,
    can_record_group_repayments: false,
    can_edit_group_origination: false,
    is_group_chairperson: false,
    ...overrides,
  } as MobileClientSessionContext;
}

describe('session-auth group gates', () => {
  it('grants roster view to parent, roster admins, leaders, and credentials actors', () => {
    expect(canViewGroupMembersRoster(session({ dashboard_mode: 'group_parent' }))).toBe(true);
    expect(
      canViewGroupMembersRoster(session({ can_administer_group_roster: true }))
    ).toBe(true);
    expect(canViewGroupMembersRoster(session({ can_manage_group_leaders: true }))).toBe(true);
    expect(
      canViewGroupMembersRoster(session({ can_provision_member_credentials: true }))
    ).toBe(true);
  });

  it('does not grant roster view from repay-only (avoids list 403)', () => {
    expect(
      canViewGroupMembersRoster(
        session({
          dashboard_mode: 'group_member',
          can_record_group_repayments: true,
        })
      )
    ).toBe(false);
  });

  it('scopes profile vs member-loans separately', () => {
    const rosterOnly = session({ can_administer_group_roster: true });
    expect(canViewGroupMemberProfile(rosterOnly)).toBe(true);
    expect(canViewGroupMemberLoans(rosterOnly)).toBe(false);

    const repayOnly = session({ can_record_group_repayments: true });
    expect(canViewGroupMemberProfile(repayOnly)).toBe(false);
    expect(canViewGroupMemberLoans(repayOnly)).toBe(true);
    expect(canRecordGroupRepayments(repayOnly)).toBe(true);
  });

  it('treats group_parent as roster admin for mutations', () => {
    expect(canAdministerGroupRoster(session({ dashboard_mode: 'group_parent' }))).toBe(true);
    expect(resolveIsGroupAdmin(session({ dashboard_mode: 'group_parent' }))).toBe(true);
  });

  it('keeps borrower credential provisioning disabled', () => {
    expect(
      canProvisionGroupMemberCredentials(
        session({ can_provision_member_credentials: true, can_administer_group_roster: true })
      )
    ).toBe(false);
  });
});
