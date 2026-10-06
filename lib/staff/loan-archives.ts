/**
 * Shared Loan Archives helpers for every staff role that opens an archive queue.
 * Keep page sizes and outstanding math identical to the dashboard.
 */

import { isZeroBalanceLegacyArchive, outstandingBalanceMinor } from '@/lib/staff/legacy-booking';

export const LOAN_ARCHIVE_PAGE_SIZE = 25;
export const LOAN_ARCHIVE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type LoanArchivePageSize = (typeof LOAN_ARCHIVE_PAGE_SIZE_OPTIONS)[number];

export function normalizeLoanArchivePageSize(value: string | number | null | undefined): LoanArchivePageSize {
  const n = typeof value === 'number' ? value : Number(value);
  if (LOAN_ARCHIVE_PAGE_SIZE_OPTIONS.includes(n as LoanArchivePageSize)) {
    return n as LoanArchivePageSize;
  }
  return LOAN_ARCHIVE_PAGE_SIZE;
}

export function archiveOutstandingMinor(row: {
  outstanding_balance?: number | null;
  outstandingBalanceMinor?: number | null;
  outstanding_principal?: number | null;
  outstanding_interest?: number | null;
}): number {
  if (row.outstanding_balance != null) return Number(row.outstanding_balance) || 0;
  return outstandingBalanceMinor(row);
}

export function isLegacyArchiveEligible(row: {
  legacyBookingStatus?: string | null;
  legacy_booking_status?: string | null;
  outstanding_balance?: number | null;
  outstandingBalanceMinor?: number | null;
  outstanding_principal?: number | null;
  outstanding_interest?: number | null;
}): boolean {
  return isZeroBalanceLegacyArchive({
    ...row,
    outstandingBalanceMinor: archiveOutstandingMinor(row),
  });
}

export { isZeroBalanceLegacyArchive, outstandingBalanceMinor };
