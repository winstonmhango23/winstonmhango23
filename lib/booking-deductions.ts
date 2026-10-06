/**
 * Disbursement booking deductions — RN mirror of `cofi-bms-dashboard/lib/booking-deductions.ts`.
 *
 * Mirrors `cofi-bms-api/app/services/booking_deduction_service.py` so the
 * accountant sees the exact net payouts the backend enforces at booking:
 * each named deduction (title + description) reduces the payout/release amount
 * of a group member or individual client by a percentage (`percentage_bps`,
 * 10000 == 100%) or a custom amount (`amount_minor`).
 */

export type BookingDeductionBasis = 'percentage' | 'amount';

export type BookingDeductionSpec = {
  title: string;
  description?: string;
  basis: BookingDeductionBasis;
  /** Basis points for percentage deductions (10000 == 100%). */
  percentage_bps?: number;
  /** Custom amount in minor units (MWK × 100). */
  amount_minor?: number;
  /** Optional GL income/payable account code credited for this deduction. */
  gl_account_code?: string;
  /** Target group member. Omit for an individual client booking. */
  client_id?: number;
};

export interface BookingDeductionPayee {
  clientId?: number;
  clientName: string;
  /** Gross (untripped) payout share for this payee, in minor units. */
  grossMinor: number;
}

export interface ComputedBookingDeduction {
  spec: BookingDeductionSpec;
  grossMinor: number;
  computedMinor: number;
}

export interface BookingDeductionsResult {
  clientId?: number;
  grossMinor: number;
  lines: ComputedBookingDeduction[];
  totalDeductionsMinor: number;
  netMinor: number;
}

export const MAX_DEDUCTIONS_PER_PAYEE = 25;

export function emptyDeduction(clientId?: number): BookingDeductionSpec {
  return {
    title: '',
    basis: 'amount',
    amount_minor: 0,
    client_id: clientId,
  };
}

export function validateDeductionSpec(spec: BookingDeductionSpec): string | null {
  if (!spec.title?.trim()) return 'Every deduction needs a title.';
  if (spec.basis === 'percentage') {
    const bps = Number(spec.percentage_bps ?? 0);
    if (!Number.isFinite(bps) || bps <= 0) return `"${spec.title}" needs a percentage > 0.`;
    if (bps > 10000) return `"${spec.title}" cannot exceed 100%.`;
  } else {
    const amt = Number(spec.amount_minor ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) return `"${spec.title}" needs an amount > 0.`;
  }
  return null;
}

export function computeSingleDeductionMinor(spec: BookingDeductionSpec, grossMinor: number): number {
  if (spec.basis === 'percentage') {
    const bps = Number(spec.percentage_bps ?? 0);
    if (!Number.isFinite(bps) || bps <= 0) return 0;
    return Math.round(grossMinor * (bps / 10000));
  }
  const amt = Number(spec.amount_minor ?? 0);
  return Number.isFinite(amt) ? Math.round(amt) : 0;
}

/**
 * Compute full deduction outcomes for one payee. Throws `Error` (message is
 * UI-safe) when a deduction is invalid or would consume the whole payout —
 * matching the backend's `BookingDeductionError` → HTTP 400 behaviour.
 */
export function computeBookingDeductions(
  grossMinor: number,
  rawSpecs: BookingDeductionSpec[]
): BookingDeductionsResult {
  const gross = Math.max(0, Math.round(grossMinor));
  const specs = rawSpecs.filter((s) => s && s.title && s.title.trim());
  if (specs.length > MAX_DEDUCTIONS_PER_PAYEE) {
    throw new Error(`No more than ${MAX_DEDUCTIONS_PER_PAYEE} deductions may apply to one payee.`);
  }
  const lines: ComputedBookingDeduction[] = [];
  let running = gross;
  for (const spec of specs) {
    const err = validateDeductionSpec(spec);
    if (err) throw new Error(err);
    const value = computeSingleDeductionMinor(spec, gross);
    if (value > running) {
      throw new Error(
        `"${spec.title}" exceeds the remaining payout for this client (remaining ${running} minor units).`
      );
    }
    lines.push({ spec, grossMinor: gross, computedMinor: value });
    running -= value;
  }
  const total = lines.reduce((sum, l) => sum + l.computedMinor, 0);
  const net = Math.max(gross - total, 0);
  if (net <= 0) {
    throw new Error('Deductions would leave no payout for this client. Reduce or remove a deduction.');
  }
  return { grossMinor: gross, lines, totalDeductionsMinor: total, netMinor: net };
}

/** Convenience: run `computeBookingDeductions` but tolerate invalid rows (restores last-good edit state). */
export function tryComputeBookingDeductions(
  grossMinor: number,
  rawSpecs: BookingDeductionSpec[]
): { result: BookingDeductionsResult | null; error: string | null } {
  try {
    return { result: computeBookingDeductions(grossMinor, rawSpecs), error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Per-payee deduction rows read back from the `[deductions]` notes block. */
export type BookingDeductionNotesPayee = {
  client_id?: number | null;
  gross_minor: number;
  total_deductions_minor: number;
  net_minor: number;
  lines: {
    title: string;
    description?: string | null;
    basis?: string;
    percentage_bps?: number | null;
    amount_minor?: number | null;
    gl_account_code?: string | null;
    client_id?: number | null;
    gross_minor: number;
    computed_minor: number;
  }[];
};

/**
 * Parse the group loan allocation JSON into per-member payout shares,
 * tolerating member key formats `{ "<clientId>": { amount_minor, ... } }`.
 */
export function payeesFromGroupAllocation(
  allocation: Record<string, unknown> | null | undefined,
  fallbackName = 'Group members'
): BookingDeductionPayee[] {
  if (!allocation || typeof allocation !== 'object') return [];
  const payees: BookingDeductionPayee[] = [];
  for (const [clientId, entry] of Object.entries(allocation)) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as { amount_minor?: unknown; amount?: unknown; full_name?: unknown; client_name?: unknown; member_name?: unknown };
    const amountMinor = Number(row.amount_minor ?? row.amount ?? 0);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) continue;
    const id = Number(clientId);
    const name =
      typeof row.full_name === 'string' && row.full_name.trim()
        ? row.full_name.trim()
        : typeof row.client_name === 'string' && row.client_name.trim()
          ? row.client_name.trim()
          : typeof row.member_name === 'string' && row.member_name.trim()
            ? row.member_name.trim()
            : Number.isFinite(id)
              ? `Member #${clientId}`
              : fallbackName;
    payees.push({ clientId: Number.isFinite(id) ? id : undefined, clientName: name, grossMinor: amountMinor });
  }
  return payees.sort((a, b) => String(a.clientName).localeCompare(String(b.clientName)));
}