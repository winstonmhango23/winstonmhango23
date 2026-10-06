/**
 * Group loan share helpers for borrower UI (portal parity).
 */

import type { MobileClientSessionContext } from '@/lib/data/api';
import type { Loan, LoanApplication } from '@/store/test-data';

/** Outstanding amount the viewer should see (share when group facility). */
export function loanOutstandingForViewer(loan: Pick<
  Loan,
  'outstanding_principal' | 'is_group_facility' | 'my_share_outstanding_minor'
>): number {
  if (
    loan.is_group_facility &&
    loan.my_share_outstanding_minor != null &&
    Number.isFinite(loan.my_share_outstanding_minor)
  ) {
    return Math.max(0, Math.trunc(loan.my_share_outstanding_minor));
  }
  return Math.max(0, Math.trunc(loan.outstanding_principal ?? 0));
}

/** Principal the viewer should see (share when group facility). */
export function loanPrincipalForViewer(loan: Pick<
  Loan,
  'principal_amount' | 'is_group_facility' | 'my_share_principal_minor'
>): number {
  if (
    loan.is_group_facility &&
    loan.my_share_principal_minor != null &&
    Number.isFinite(loan.my_share_principal_minor)
  ) {
    return Math.max(0, Math.trunc(loan.my_share_principal_minor));
  }
  return Math.max(0, Math.trunc(loan.principal_amount ?? 0));
}

export function applicationRequestedForViewer(app: Pick<
  LoanApplication,
  'requested_amount' | 'is_group_application' | 'my_share_requested_amount_minor'
>): number {
  if (
    app.is_group_application &&
    app.my_share_requested_amount_minor != null &&
    Number.isFinite(app.my_share_requested_amount_minor)
  ) {
    return Math.max(0, Math.trunc(app.my_share_requested_amount_minor));
  }
  return Math.max(0, Math.trunc(app.requested_amount ?? 0));
}

/**
 * Portal parity: group members may view progress; only chair/authorized leaders record repayments.
 * Individuals and group parents always may repay their own loans.
 */
export function clientMayRecordRepayment(
  session: MobileClientSessionContext | null | undefined,
  loan?: Pick<Loan, 'is_group_facility'> | null
): boolean {
  if (!session) return true;
  if (session.dashboard_mode !== 'group_member') return true;
  if (loan && !loan.is_group_facility) return true;
  return session.can_record_group_repayments === true;
}
