export const ACCOUNTANT_CLEARED_LEGACY_STATUSES = [
  'booked',
  'accounting_posted',
  'tracking_confirmed',
] as const;

export const ACCOUNTANT_FUNDED_BOOK_STATUSES =
  'DISBURSED,ACTIVE,DELINQUENT,DEFAULTED,CLOSED,WRITTEN_OFF';

export type CeoFundMappingFields = {
  allocationId?: number | null;
  allocation_id?: number | null;
  fundingFundName?: string | null;
  funding_fund_name?: string | null;
  investmentAssigned?: boolean | null;
  investment_assigned?: boolean | null;
};

export function isAccountantClearedLegacyStatus(status?: string | null): boolean {
  return ACCOUNTANT_CLEARED_LEGACY_STATUSES.includes(
    String(status ?? '')
      .trim()
      .toLowerCase() as (typeof ACCOUNTANT_CLEARED_LEGACY_STATUSES)[number]
  );
}

/** True when the loan has no CEO investment pool / fund attached. */
export function loanNeedsCeoFundMapping(loan: CeoFundMappingFields): boolean {
  if (loan.investmentAssigned === true || loan.investment_assigned === true) return false;
  const allocation = loan.allocationId ?? loan.allocation_id ?? null;
  const name = String(loan.fundingFundName ?? loan.funding_fund_name ?? '').trim();
  return allocation == null && name.length === 0;
}

export function ceoFundDisplayName(loan: CeoFundMappingFields): string | null {
  const name = String(loan.fundingFundName ?? loan.funding_fund_name ?? '').trim();
  return name.length > 0 ? name : null;
}
