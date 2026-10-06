import {
  computeCollateralCoverageState,
  requiredCollateralValueMinor,
  sumCollateralValueMinor,
} from '@/lib/collateral-coverage';

describe('collateral coverage', () => {
  it('computes double-loan security requirement', () => {
    expect(requiredCollateralValueMinor(100_000_000, 200)).toBe(200_000_000);
  });

  it('treats one high-value property as sufficient', () => {
    const state = computeCollateralCoverageState({
      loanAmountMinor: 100_000_000,
      minCoveragePct: 200,
      pledgedValueMinor: 250_000_000,
      requiresCollateral: true,
      collateralCount: 1,
    });
    expect(state.coverageMet).toBe(true);
    expect(state.shortfallMinor).toBe(0);
  });

  it('reports shortfall until pledged value meets requirement', () => {
    const state = computeCollateralCoverageState({
      loanAmountMinor: 100_000_000,
      minCoveragePct: 200,
      pledgedValueMinor: 50_000_000,
      requiresCollateral: true,
      collateralCount: 2,
    });
    expect(state.coverageMet).toBe(false);
    expect(state.requiredValueMinor).toBe(200_000_000);
    expect(state.shortfallMinor).toBe(150_000_000);
  });

  it('sums estimated_value from collateral rows', () => {
    expect(
      sumCollateralValueMinor([
        { estimated_value: 10_000_00 },
        { estimatedValue: 5_000_00 },
      ])
    ).toBe(15_000_00);
  });
});
