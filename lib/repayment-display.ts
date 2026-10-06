import type { Loan } from '@/store/test-data';

/** Matches cofi-bms-dashboard `formatOriginationStageForUi` (origination pipeline copy). */
const ORIGINATION_STAGE_LABELS: Record<string, string> = {
  TRACKING_REPAYMENT: 'Repayment tracking active',
  DISBURSED_OPS_QUEUE: 'Operations — schedule setup',
  OPS_PENDING_MANAGER: 'Awaiting operations manager',
  PENDING_DISBURSEMENT: 'Pending disbursement',
  SUBMITTED_TO_CIO: 'With CIO',
  CIO_VERIFIED_TO_PM: 'With portfolio manager',
  SUBMITTED_TO_CEO: 'With CEO',
  SUBMITTED_TO_GCEO: 'With GCEO',
  RETURNED_TO_LO: 'Returned to loan officer',
  DRAFT: 'Draft',
};

function formatOriginationStage(stage: string): string {
  const s = String(stage).trim();
  if (!s) return '';
  return (
    ORIGINATION_STAGE_LABELS[s] ??
    s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Short subtitle for mobile loan rows / detail (aligned with API repayment fields). */
export function repaymentScheduleSubtitle(
  loan: Pick<Loan, 'repayment_tracking_live' | 'days_until_next_repayment' | 'application_origination_stage'>
): string {
  if (loan.repayment_tracking_live === false) {
    const st = loan.application_origination_stage;
    if (st) return `Pipeline: ${formatOriginationStage(st)}`;
    return 'Countdown after operations handoff';
  }
  const d = loan.days_until_next_repayment;
  if (d == null || d === undefined) return '';
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'Due today';
  return `Due in ${d}d`;
}
