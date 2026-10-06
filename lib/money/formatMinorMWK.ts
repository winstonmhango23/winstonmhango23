/**
 * Canonical MWK formatter for minor-unit (×100) amounts — E6.5 / E6.10.
 */

const MWK_FORMAT: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

export function formatMinorMWK(minor: number | null | undefined): string {
  const major = Number(minor);
  if (!Number.isFinite(major)) {
    return 'MK 0.00';
  }
  return `MK ${(major / 100).toLocaleString(undefined, MWK_FORMAT)}`;
}

/** @deprecated Use formatMinorMWK — kept for AmountText import stability */
export function formatAmount(cents: number): string {
  return formatMinorMWK(cents);
}
