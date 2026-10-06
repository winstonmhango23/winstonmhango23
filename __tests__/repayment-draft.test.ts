import {
  isMutableDraftRepayment,
  normalizeRepaymentLifecycleState,
  repaymentLifecycleLabel,
} from '@/lib/client-portal/repayment-draft';
import { loanOutstandingForViewer } from '@/lib/loan-origination/group-share-display';

describe('repayment draft mutability (portal parity)', () => {
  it('allows edit/delete for draft and pre-post lifecycle states', () => {
    expect(isMutableDraftRepayment({ lifecycle_state: 'DRAFT' })).toBe(true);
    expect(
      isMutableDraftRepayment({ lifecycle_state: 'PENDING_OPERATIONS_VERIFICATION' })
    ).toBe(true);
    expect(isMutableDraftRepayment({ lifecycle_state: 'PENDING OPERATIONS VERIFICATION' })).toBe(
      true
    );
    expect(isMutableDraftRepayment({ lifecycle_state: 'OPERATIONS_VERIFIED' })).toBe(true);
  });

  it('blocks edit/delete after manager approval / posted states', () => {
    expect(isMutableDraftRepayment({ lifecycle_state: 'POSTED' })).toBe(false);
    expect(isMutableDraftRepayment({ lifecycle_state: 'MANAGER_APPROVED' })).toBe(false);
    expect(isMutableDraftRepayment({ status: 'COMPLETED' })).toBe(false);
  });

  it('normalizes and labels lifecycle states', () => {
    expect(normalizeRepaymentLifecycleState('pending operations verification')).toBe(
      'PENDING_OPERATIONS_VERIFICATION'
    );
    expect(
      repaymentLifecycleLabel({
        lifecycle_state: 'PENDING_OPERATIONS_VERIFICATION',
      })
    ).toBe('PENDING OPERATIONS VERIFICATION');
  });
});

describe('home outstanding share awareness', () => {
  it('uses group member share when facility is shared', () => {
    expect(
      loanOutstandingForViewer({
        outstanding_principal: 1_000_000,
        is_group_facility: true,
        my_share_outstanding_minor: 250_000,
      })
    ).toBe(250_000);
  });

  it('falls back to facility outstanding for individual loans', () => {
    expect(
      loanOutstandingForViewer({
        outstanding_principal: 500_000,
        is_group_facility: false,
        my_share_outstanding_minor: null,
      })
    ).toBe(500_000);
  });
});
