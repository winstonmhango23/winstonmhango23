import type { ApiRepaymentOverviewItem } from '@/lib/data/api';
import type { Loan } from '@/store';

export type LegacyCreditBook = 'SME' | 'GROUP' | 'AGRICULTURAL';

const AGRICULTURAL_ALIASES = new Set(['AGRI', 'AGRIC', 'AGRICULTURE', 'AGRICULTURAL']);
const GROUP_ALIASES = new Set(['GROUP', 'VILLAGE', 'COOPERATIVE', 'VILLAGE_BANKING']);

export function normalizeLegacyCreditBook(value?: string | null): LegacyCreditBook {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (raw === 'SME' || raw === 'BUSINESS' || raw === 'MSME') return 'SME';
  if (GROUP_ALIASES.has(raw)) return 'GROUP';
  if (AGRICULTURAL_ALIASES.has(raw)) return 'AGRICULTURAL';
  return 'GROUP';
}

export function legacyCreditBookLabel(book?: string | null): string {
  const normalized = normalizeLegacyCreditBook(book);
  if (normalized === 'SME') return 'SME';
  if (normalized === 'GROUP') return 'Group';
  return 'Agricultural';
}

function asTime(value?: string | null): number | null {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return new Date(`${raw}T00:00:00`).getTime();
}

function startOfToday(today?: Date): number {
  const day = today ?? new Date();
  return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
}

/** 0 = overdue, 1 = due today, 2 = upcoming / far-off. */
export function legacyRepaymentUrgency(
  item: Pick<ApiRepaymentOverviewItem, 'days_in_arrears' | 'next_due_date'>,
  today?: Date
): [number, number, number] {
  const arrears = Number(item.days_in_arrears ?? 0);
  const due = asTime(item.next_due_date);
  const now = startOfToday(today);
  if (arrears > 0) return [0, -arrears, due ?? 0];
  if (due === now) return [1, 0, due];
  return [2, 0, due ?? Number.MAX_SAFE_INTEGER];
}

export function sortLegacyRepaymentsByUrgency<T extends ApiRepaymentOverviewItem>(
  items: T[],
  today?: Date
): T[] {
  return [...items].sort((a, b) => {
    const left = legacyRepaymentUrgency(a, today);
    const right = legacyRepaymentUrgency(b, today);
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return a.id - b.id;
  });
}

export function legacyRepaymentUrgencyLabel(
  item: Pick<ApiRepaymentOverviewItem, 'days_in_arrears' | 'next_due_date'>,
  today?: Date
): 'Overdue' | 'Due today' | 'Upcoming' {
  const group = legacyRepaymentUrgency(item, today)[0];
  if (group === 0) return 'Overdue';
  if (group === 1) return 'Due today';
  return 'Upcoming';
}

export type CurrentRepaymentBucket = 'all' | 'overdue' | 'due_today' | 'upcoming';

export function mergeCurrentRepaymentLoans(
  due: ApiRepaymentOverviewItem[],
  overdue: ApiRepaymentOverviewItem[],
  upcoming: ApiRepaymentOverviewItem[]
): ApiRepaymentOverviewItem[] {
  const seen = new Set<number>();
  return [...overdue, ...due, ...upcoming].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export function currentRepaymentBucketCounts(
  due: ApiRepaymentOverviewItem[],
  overdue: ApiRepaymentOverviewItem[],
  upcoming: ApiRepaymentOverviewItem[]
): Record<CurrentRepaymentBucket, number> {
  return {
    all: mergeCurrentRepaymentLoans(due, overdue, upcoming).length,
    overdue: overdue.length,
    due_today: due.length,
    upcoming: upcoming.length,
  };
}

export function selectCurrentRepaymentBucket(
  due: ApiRepaymentOverviewItem[],
  overdue: ApiRepaymentOverviewItem[],
  upcoming: ApiRepaymentOverviewItem[],
  bucket: CurrentRepaymentBucket
): ApiRepaymentOverviewItem[] {
  if (bucket === 'overdue') return overdue;
  if (bucket === 'due_today') return due;
  if (bucket === 'upcoming') return upcoming;
  return mergeCurrentRepaymentLoans(due, overdue, upcoming);
}

export function overviewRowMatchesSearch(
  row: Pick<ApiRepaymentOverviewItem, 'loan_account_number' | 'client_name' | 'product_name' | 'id'>,
  search?: string | null
): boolean {
  const query = String(search ?? '')
    .trim()
    .toLowerCase();
  if (!query) return true;
  return [row.loan_account_number, row.client_name, row.product_name, String(row.id)]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

export function overviewToStaffLoan(item: ApiRepaymentOverviewItem): Loan {
  return {
    id: item.id,
    loan_account_number: item.loan_account_number,
    client_name: item.client_name?.trim() || item.loan_account_number,
    client_id: item.client_id,
    product_name: item.product_name ?? '',
    principal_amount: item.outstanding_principal,
    outstanding_principal: item.outstanding_principal,
    total_repaid: 0,
    status: item.status ?? 'ACTIVE',
    next_due_date: item.next_due_date ?? undefined,
    days_in_arrears: item.days_in_arrears ?? 0,
    interest_rate: 0,
    term_months: 0,
  };
}

export function legacyBookToActionItems(rows: ApiRepaymentOverviewItem[]) {
  return sortLegacyRepaymentsByUrgency(rows).map((row) => {
    const urgency = legacyRepaymentUrgencyLabel(row);
    const arrears =
      urgency === 'Overdue' && row.days_in_arrears
        ? ` · ${row.days_in_arrears} days in arrears`
        : '';
    const trackingPending = row.schedule_tracking_pending === true;
    const baseMeta = row.next_due_date
      ? `${urgency} · ${String(row.next_due_date).slice(0, 10)}${arrears}`
      : urgency;
    return {
      id: String(row.id),
      title: row.client_name?.trim() || row.loan_account_number || `Loan #${row.id}`,
      subtitle: [row.loan_account_number, row.product_name, row.status].filter(Boolean).join(' · '),
      meta: trackingPending ? `${baseMeta} · Awaiting tracking start` : baseMeta,
      amountMinor: row.next_due_amount ?? row.outstanding_principal,
      loanId: row.id,
      scheduleTrackingPending: trackingPending,
    };
  });
}
