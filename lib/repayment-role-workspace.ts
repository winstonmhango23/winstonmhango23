import {
  isAccountantStaffRole,
  isCreditOfficerStaffRole,
  isLoanOfficerStaffRole,
} from '@/lib/loan-origination/origination-workflow';

export type RepaymentProcessorVariant = 'collect' | 'oversight';

/**
 * Cash collection (record repayments / generate repayment schedules) mirrors the backend
 * `require_repayment_booking` gate: booking is for teller and operations officer / assistant /
 * manager plus portfolio managers and executives. Loan officers, credit & investment officers
 * (and senior CIOs) get a read-only ledger — the backend rejects their repayment/schedule
 * mutations. Accountant stays on a read-only ledger.
 */
export function repaymentProcessorVariantForRole(role?: string | null): RepaymentProcessorVariant {
  if (
    isAccountantStaffRole(role) ||
    isLoanOfficerStaffRole(role) ||
    isCreditOfficerStaffRole(role)
  ) {
    return 'oversight';
  }
  return 'collect';
}

export function canCollectRepayments(role?: string | null): boolean {
  return repaymentProcessorVariantForRole(role) === 'collect';
}
