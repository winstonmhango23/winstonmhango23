import {
  applicationRequestedForViewer,
  clientMayRecordRepayment,
  loanOutstandingForViewer,
  loanPrincipalForViewer,
} from '@/lib/loan-origination/group-share-display';
import type { MobileClientSessionContext } from '@/lib/data/api';

const memberSession = {
  dashboard_mode: 'group_member',
  can_record_group_repayments: false,
} as MobileClientSessionContext;

const chairSession = {
  dashboard_mode: 'group_member',
  can_record_group_repayments: true,
} as MobileClientSessionContext;

describe('group-share-display', () => {
  it('prefers share outstanding on group facilities', () => {
    expect(
      loanOutstandingForViewer({
        outstanding_principal: 80_000,
        is_group_facility: true,
        my_share_outstanding_minor: 48_000,
      })
    ).toBe(48_000);
    expect(
      loanPrincipalForViewer({
        principal_amount: 100_000,
        is_group_facility: true,
        my_share_principal_minor: 60_000,
      })
    ).toBe(60_000);
  });

  it('falls back to full amounts for individual loans', () => {
    expect(
      loanOutstandingForViewer({
        outstanding_principal: 12_000,
        is_group_facility: false,
        my_share_outstanding_minor: null,
      })
    ).toBe(12_000);
  });

  it('uses application share when present', () => {
    expect(
      applicationRequestedForViewer({
        requested_amount: 100_000,
        is_group_application: true,
        my_share_requested_amount_minor: 60_000,
      })
    ).toBe(60_000);
  });

  it('gates group-member repayments by can_record_group_repayments', () => {
    expect(
      clientMayRecordRepayment(memberSession, { is_group_facility: true })
    ).toBe(false);
    expect(
      clientMayRecordRepayment(chairSession, { is_group_facility: true })
    ).toBe(true);
    expect(
      clientMayRecordRepayment(memberSession, { is_group_facility: false })
    ).toBe(true);
  });
});
