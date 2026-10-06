/**
 * Collateral security coverage — mirrors backend collateral_coverage.py.
 * Product min_collateral_coverage is % of loan (100 = full, 200 = double).
 */

export type CollateralCoverageInput = {
  loanAmountMinor: number;
  minCoveragePct?: number | null;
  pledgedValueMinor: number;
  requiresCollateral: boolean;
  collateralCount: number;
};

export type CollateralCoverageState = {
  loanAmountMinor: number;
  minCoveragePct: number | null;
  requiredValueMinor: number | null;
  pledgedValueMinor: number;
  shortfallMinor: number;
  coverageMet: boolean;
};

export function requiredCollateralValueMinor(
  loanAmountMinor: number,
  minCoveragePct?: number | null
): number | null {
  const pct = minCoveragePct != null ? Number(minCoveragePct) : null;
  if (pct == null || !Number.isFinite(pct) || pct <= 0 || loanAmountMinor <= 0) return null;
  return Math.floor((loanAmountMinor * pct) / 100);
}

export function computeCollateralCoverageState(input: CollateralCoverageInput): CollateralCoverageState {
  const loanAmountMinor = Math.max(0, Math.floor(Number(input.loanAmountMinor) || 0));
  const pledgedValueMinor = Math.max(0, Math.floor(Number(input.pledgedValueMinor) || 0));
  const collateralCount = Math.max(0, Math.floor(Number(input.collateralCount) || 0));
  const requiredValueMinor = requiredCollateralValueMinor(loanAmountMinor, input.minCoveragePct);
  const pct =
    input.minCoveragePct != null && Number(input.minCoveragePct) > 0
      ? Math.floor(Number(input.minCoveragePct))
      : null;

  let coverageMet = true;
  if (input.requiresCollateral) {
    if (collateralCount <= 0) {
      coverageMet = false;
    } else if (requiredValueMinor != null) {
      coverageMet = pledgedValueMinor >= requiredValueMinor;
    }
  }

  const shortfallMinor =
    requiredValueMinor != null && pledgedValueMinor < requiredValueMinor
      ? requiredValueMinor - pledgedValueMinor
      : 0;

  return {
    loanAmountMinor,
    minCoveragePct: pct,
    requiredValueMinor,
    pledgedValueMinor,
    shortfallMinor,
    coverageMet,
  };
}

/** Sum estimated_value from collateral rows (API may use estimated_value or estimatedValue). */
export function sumCollateralValueMinor(
  rows: Array<{ estimated_value?: number | null; estimatedValue?: number | null }>
): number {
  return rows.reduce((sum, row) => {
    const v = row.estimated_value ?? row.estimatedValue ?? 0;
    return sum + Math.max(0, Math.floor(Number(v) || 0));
  }, 0);
}
