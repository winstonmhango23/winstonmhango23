/**
 * Cash collateral 15% requirement helpers.
 * Mirrors the dashboard LoanCollateralManager / client portal collateral hub:
 * the cash collateral commitment is 15% of requested loan amounts, compared
 * against the available cash collateral balance.
 */

export const CASH_COLLATERAL_REQUIREMENT_RATE = 0.15;

/** Statuses that should never count toward the outstanding 15% requirement. */
const NON_APPLICABLE_STATUSES = new Set([
  'DRAFT',
  'REJECTED',
  'DECLINED',
  'WITHDRAWN',
  'CANCELLED',
  'CANCELED',
  'FAILED',
  'EXPIRED',
]);

export type CashCollateralApplicationInput = {
  requested_amount?: number | string | null;
  my_share_requested_amount_minor?: number | string | null;
  status?: string | null;
};

/** True when an application still contributes to the cash collateral requirement. */
export function cashCollateralApplicationApplicable(
  app: CashCollateralApplicationInput | null | undefined
): boolean {
  if (!app) return false;
  const status = String(app.status ?? '').toUpperCase();
  if (NON_APPLICABLE_STATUSES.has(status)) return false;
  return cashCollateralBaseAmount(app) > 0;
}

/**
 * Base amount an application contributes toward the 15% commitment.
 * Group members contribute their own share; everyone else uses requested_amount.
 */
export function cashCollateralBaseAmount(
  app: CashCollateralApplicationInput | null | undefined
): number {
  if (!app) return 0;
  const share = Number(app.my_share_requested_amount_minor);
  if (Number.isFinite(share) && share > 0) return share;
  const requested = Number(app.requested_amount);
  return Number.isFinite(requested) && requested > 0 ? requested : 0;
}

/** 15% of applicable requested amounts, in minor units. */
export function cashCollateralRequiredMinor(
  applications: readonly (CashCollateralApplicationInput | null | undefined)[]
): number {
  let base = 0;
  for (const app of applications) {
    if (!cashCollateralApplicationApplicable(app)) continue;
    base += cashCollateralBaseAmount(app);
  }
  return Math.round(base * CASH_COLLATERAL_REQUIREMENT_RATE);
}

/** Shortfall = max(0, required − available), in minor units. Zero when covered. */
export function collateralShortfallMinor(requiredMinor: number, availableMinor: number): number {
  return Math.max(0, requiredMinor - availableMinor);
}

export type CashCollateralRequirementStatus = 'sufficient' | 'shortfall' | 'none';

/** Classify coverage status for banner rendering. */
export function cashCollateralRequirementStatus(
  requiredMinor: number,
  availableMinor: number
): CashCollateralRequirementStatus {
  if (requiredMinor <= 0) return 'none';
  return availableMinor >= requiredMinor ? 'sufficient' : 'shortfall';
}