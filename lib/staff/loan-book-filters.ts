import type { OpsLegacyQueue } from '@/lib/staff/ops-legacy-queue';
import {
  LOAN_ARCHIVE_PAGE_SIZE,
  LOAN_ARCHIVE_PAGE_SIZE_OPTIONS,
  type LoanArchivePageSize,
} from '@/lib/staff/loan-archives';

export type StaffCreditBook = 'SME' | 'GROUP';
export type StaffLoanVintage = 'all' | 'recent' | 'legacy';
export type { OpsLegacyQueue };

export type StaffBookTotals = {
  sme: number;
  group: number;
  agricultural: number;
};

export const STAFF_LOAN_PAGE_SIZE = 20;
export const LOAN_LIST_PAGE_SIZE_OPTIONS = LOAN_ARCHIVE_PAGE_SIZE_OPTIONS;
export { LOAN_ARCHIVE_PAGE_SIZE, LOAN_ARCHIVE_PAGE_SIZE_OPTIONS };
export type { LoanArchivePageSize };

const AGRICULTURAL_ALIASES = new Set(['AGRI', 'AGRIC', 'AGRICULTURE', 'AGRICULTURAL']);
const GROUP_ALIASES = new Set([
  'GROUP',
  'VILLAGE',
  'COOPERATIVE',
  'VILLAGE_BANKING',
  ...AGRICULTURAL_ALIASES,
]);

function compactBookToken(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

/** Isolated nav `?book=AGRICULTURAL` (and other agri stamps) maps to the Group book. */
export function isolateCreditBook(value?: string | null): StaffCreditBook | undefined {
  const raw = compactBookToken(value);
  if (raw === 'SME' || raw === 'BUSINESS' || raw === 'MSME') return 'SME';
  if (GROUP_ALIASES.has(raw)) return 'GROUP';
  return undefined;
}

export function isolateAgriculturalFilter(value?: string | string[] | null): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  const token = String(raw ?? '')
    .trim()
    .toLowerCase();
  return token === '1' || token === 'true' || token === 'yes' || token === 'agri';
}

export function emptyBookTotals(): StaffBookTotals {
  return { sme: 0, group: 0, agricultural: 0 };
}

export function readBookTotals(totals?: {
  sme?: number;
  group?: number;
  agricultural?: number;
} | null): StaffBookTotals {
  return {
    sme: Number(totals?.sme ?? 0),
    group: Number(totals?.group ?? 0),
    agricultural: Number(totals?.agricultural ?? 0),
  };
}

export function combinedBookCount(totals: StaffBookTotals): number {
  return totals.sme + totals.group;
}

export function vintageToLegacyFlag(vintage: StaffLoanVintage): boolean | undefined {
  if (vintage === 'legacy') return true;
  if (vintage === 'recent') return false;
  return undefined;
}

export function loanListSkip(page: number, size = STAFF_LOAN_PAGE_SIZE): number {
  return Math.max(0, (Math.max(1, page) - 1) * Math.max(1, size));
}

export function nextLoanListPage(page: number, pages: number): number | null {
  const current = Math.max(1, page);
  const total = Math.max(1, pages);
  if (current >= total) return null;
  return current + 1;
}

export function buildLoanListQuery(opts: {
  creditBook?: string | null;
  isAgricultural?: boolean;
  vintage?: StaffLoanVintage;
  page?: number;
  size?: number;
  assignedOnly?: boolean;
  supervisedOnly?: boolean;
  legacyQueue?: OpsLegacyQueue | 'active';
  hasBalance?: boolean;
}): {
  credit_book?: string;
  is_agricultural?: boolean;
  is_legacy?: boolean;
  skip: number;
  limit: number;
  assigned_only?: boolean;
  supervised_only?: boolean;
  legacy_queue?: OpsLegacyQueue | 'active';
  has_balance?: boolean;
} {
  const size = opts.size ?? STAFF_LOAN_PAGE_SIZE;
  const isArchive = opts.legacyQueue === 'archive';
  const book = isArchive ? undefined : isolateCreditBook(opts.creditBook);
  const isLegacy = vintageToLegacyFlag(opts.vintage ?? 'all');
  const hasBalance = isArchive ? undefined : opts.hasBalance;
  return {
    credit_book: book,
    is_agricultural: isArchive || !opts.isAgricultural ? undefined : true,
    is_legacy: isLegacy,
    skip: loanListSkip(opts.page ?? 1, size),
    limit: size,
    assigned_only: opts.assignedOnly || undefined,
    supervised_only: opts.supervisedOnly || undefined,
    legacy_queue: opts.legacyQueue,
    has_balance: hasBalance,
  };
}
