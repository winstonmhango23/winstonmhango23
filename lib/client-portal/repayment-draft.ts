/**
 * Portal-parity helpers for borrower repayment draft mutation / display.
 */

export type RepaymentLifecycleLike = {
  lifecycle_state?: string | null;
  internal_status?: string | null;
  status?: string | null;
};

/** States where the borrower may edit or delete a draft repayment (portal parity). */
const MUTABLE_DRAFT_STATES = new Set([
  'DRAFT',
  'PENDING_OPERATIONS_VERIFICATION',
  'PENDING OPERATIONS VERIFICATION',
  'OPERATIONS_VERIFIED',
  'OPERATIONS VERIFIED',
]);

export function normalizeRepaymentLifecycleState(
  value: string | null | undefined
): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

export function repaymentLifecycleLabel(row: RepaymentLifecycleLike): string {
  const raw =
    row.lifecycle_state || row.internal_status || row.status || 'UNKNOWN';
  return String(raw).replace(/_/g, ' ');
}

export function isMutableDraftRepayment(row: RepaymentLifecycleLike): boolean {
  const candidates = [row.lifecycle_state, row.internal_status, row.status];
  return candidates.some((c) => {
    if (!c) return false;
    const spaced = String(c).trim().toUpperCase();
    const underscored = normalizeRepaymentLifecycleState(c);
    return MUTABLE_DRAFT_STATES.has(spaced) || MUTABLE_DRAFT_STATES.has(underscored);
  });
}
