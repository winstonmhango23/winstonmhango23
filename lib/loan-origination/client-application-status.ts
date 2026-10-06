/**
 * Client-facing application status labels.
 * Borrower submit-to-LO keeps API status DRAFT + origination_stage PENDING_LO_ACTION.
 */

export function normalizeOriginationStage(stage?: string | null): string {
  return String(stage ?? '')
    .trim()
    .toUpperCase();
}

/** True while the borrower can still edit / withdraw a draft before sending to LO (or after return). */
export function isBorrowerEditableDraft(status?: string | null, originationStage?: string | null): boolean {
  const st = String(status ?? '').toUpperCase();
  if (st !== 'DRAFT') return false;
  const stage = normalizeOriginationStage(originationStage);
  // Empty/DRAFT = not yet submitted. RETURNED_TO_LO = LO returned file to client for fix-up.
  if (!stage || stage === 'DRAFT' || stage === 'RETURNED_TO_LO') return true;
  // After send-to-LO (PENDING_LO_ACTION) or further pipeline, edits are closed.
  return false;
}

/** Badge / list label for client applications. */
export function clientApplicationDisplayStatus(
  status?: string | null,
  originationStage?: string | null
): string {
  const st = String(status ?? '').toUpperCase();
  const stage = normalizeOriginationStage(originationStage);

  if (st === 'WITHDRAWN') return 'Withdrawn';
  if (st === 'REJECTED') return 'Rejected';
  if (st === 'APPROVED' || st === 'DISBURSED') {
    return st === 'DISBURSED' ? 'Disbursed' : 'Approved';
  }

  if (stage === 'PENDING_LO_ACTION') return 'Submitted';
  if (stage === 'RETURNED_TO_LO') return 'Returned';
  if (
    stage === 'SUBMITTED_TO_CIO' ||
    st === 'SUBMITTED' ||
    st === 'PENDING_REVIEW' ||
    st === 'UNDER_REVIEW'
  ) {
    return 'Submitted';
  }
  if (stage === 'PENDING_DISBURSEMENT' || stage === 'PM_DRAWDOWN_SETUP_REQUIRED') {
    return 'Approved';
  }
  if (
    stage === 'DISBURSED_OPS_QUEUE' ||
    stage === 'OPS_PENDING_MANAGER' ||
    stage === 'TRACKING_REPAYMENT'
  ) {
    return 'Disbursed';
  }

  if (st === 'DRAFT') return 'Draft';
  if (!st) return 'Draft';
  return st.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
