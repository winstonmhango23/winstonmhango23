/**
 * Helpers for the loan-officer personal dashboard (dashboard BMS parity).
 */

import type { ApiLoanOfficerDashboard } from '@/lib/data/api';
import {
  formatParPct,
  parseRepaymentParHealth,
  type RepaymentParHealthSnapshot,
} from '@/lib/staff/repayment-par-health';

export type LoDashboardQueueItem = {
  key: string;
  label: string;
  count: number;
  href: string;
};

export function loDashboardQueueItems(d: ApiLoanOfficerDashboard): LoDashboardQueueItem[] {
  return [
    {
      key: 'awaiting_verification',
      label: 'Client repayments awaiting verification',
      count: d.awaiting_verification_repayments ?? 0,
      href: '/(staff)/repayments?tab=awaiting',
    },
    {
      key: 'overdue_repayments',
      label: 'Overdue repayments',
      count: d.overdue_repayments ?? 0,
      href: '/(staff)/repayments?tab=overdue',
    },
    {
      key: 'pending_apps',
      label: 'Pending applications',
      count: d.total_pending_applications ?? 0,
      href: '/(staff)/applications?queue=pending',
    },
    {
      key: 'pending_collateral',
      label: 'Collateral reviews',
      count: d.pending_collateral_reviews ?? 0,
      href: '/(staff)/applications?queue=collateral',
    },
    {
      key: 'arrears_loans',
      label: 'Loans in arrears (30+)',
      count: d.total_arrears_loans ?? 0,
      href: '/(staff)/collections',
    },
    {
      key: 'pending_disbursements',
      label: 'Pending disbursements',
      count: d.pending_disbursements ?? 0,
      href: '/(staff)/loans?queue=pending_disbursement',
    },
  ];
}

export function loParHealth(
  d: ApiLoanOfficerDashboard | null | undefined
): RepaymentParHealthSnapshot | null {
  return parseRepaymentParHealth(d?.repayment_par_health);
}

export function loPar30Pct(d: ApiLoanOfficerDashboard | null | undefined): number | null {
  return loParHealth(d)?.par_30_pct_of_live_book ?? null;
}

export { formatParPct };
