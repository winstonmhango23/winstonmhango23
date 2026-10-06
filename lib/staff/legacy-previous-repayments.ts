/** Local preview of historical legacy repayments. Mirrors the API service. */

export type LegacyPreviousRepaymentPreview = {
  loan_id?: number;
  original_total_minor: number;
  already_recorded_minor: number;
  remaining_minor: number;
  requested_minor: number;
  applied_minor: number;
  overpayment_minor: number;
  remaining_after_minor: number;
  previous_after_minor: number;
  totals_match: boolean;
  client_id?: number;
};

export type LegacyPreviousRepaymentResult = LegacyPreviousRepaymentPreview & {
  repayment_id?: number;
  refund_due_minor: number;
  reduced_to_remaining: boolean;
  overpayment_confirmed: boolean;
};

export type LegacyPreviousRepaymentBody = {
  amount_minor: number;
  payment_method?: string;
  payment_date?: string;
  reference_number?: string | null;
  physical_receipt_number?: string | null;
  notes?: string | null;
  reduce_to_remaining?: boolean;
  confirm_overpayment?: boolean;
};

export function previewLegacyPreviousRepayments(input: {
  remaining_minor: number;
  already_recorded_minor: number;
  requested_minor: number;
}): LegacyPreviousRepaymentPreview {
  const remaining = Math.max(0, Math.trunc(Number(input.remaining_minor) || 0));
  const already = Math.max(0, Math.trunc(Number(input.already_recorded_minor) || 0));
  const requested = Math.max(0, Math.trunc(Number(input.requested_minor) || 0));
  const originalTotal = remaining + already;
  const applied = remaining > 0 ? Math.min(requested, remaining) : 0;
  const overpayment = remaining >= 0 ? Math.max(0, requested - remaining) : requested;
  const remainingAfter = remaining - applied;
  const previousAfter = already + applied;
  return {
    original_total_minor: originalTotal,
    already_recorded_minor: already,
    remaining_minor: remaining,
    requested_minor: requested,
    applied_minor: applied,
    overpayment_minor: overpayment,
    remaining_after_minor: remainingAfter,
    previous_after_minor: previousAfter,
    totals_match: previousAfter + remainingAfter === originalTotal,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseOverpaymentConflict(error: unknown): LegacyPreviousRepaymentPreview | null {
  const err = error as { status?: number; details?: unknown; detail?: unknown };
  const buckets = [err?.details, err?.detail, error];
  for (const bucket of buckets) {
    const root = asRecord(bucket);
    if (!root) continue;
    const detail = asRecord(root.detail) ?? root;
    const nested = asRecord(detail.detail) ?? detail;
    if (String(nested.code ?? '') !== 'OVERPAYMENT') continue;
    return {
      original_total_minor: Number(nested.original_total_minor ?? 0),
      already_recorded_minor: Number(nested.already_recorded_minor ?? 0),
      remaining_minor: Number(nested.remaining_minor ?? 0),
      requested_minor: Number(nested.requested_minor ?? 0),
      applied_minor: Number(nested.applied_minor ?? 0),
      overpayment_minor: Number(nested.overpayment_minor ?? 0),
      remaining_after_minor: Number(nested.remaining_after_minor ?? 0),
      previous_after_minor: Number(nested.previous_after_minor ?? 0),
      totals_match: Boolean(nested.totals_match),
      loan_id: typeof nested.loan_id === 'number' ? nested.loan_id : undefined,
      client_id: typeof nested.client_id === 'number' ? nested.client_id : undefined,
    };
  }
  return null;
}
