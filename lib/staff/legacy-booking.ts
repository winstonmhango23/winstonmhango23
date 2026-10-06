export const TERMINAL_LEGACY_JOURNAL_STATUSES = new Set([
  'booked',
  'accounting_posted',
  'tracking_confirmed',
]);

export type LegacyCompletionStatus =
  | 'pending'
  | 'in_progress'
  | 'certification_complete'
  | 'ready_for_accountant'
  | 'completed';

export function outstandingBalanceMinor(loan: {
  outstandingBalanceMinor?: number | null;
  outstanding_balance?: number | null;
  outstandingPrincipalMinor?: number | null;
  outstanding_principal?: number | null;
  outstanding_interest?: number | null;
}): number {
  if (loan.outstandingBalanceMinor != null) return Number(loan.outstandingBalanceMinor) || 0;
  if (loan.outstanding_balance != null) return Number(loan.outstanding_balance) || 0;
  return (
    (Number(loan.outstandingPrincipalMinor ?? loan.outstanding_principal ?? 0) || 0) +
    (Number(loan.outstanding_interest ?? 0) || 0)
  );
}

export function isZeroBalanceLegacyArchive(loan: {
  legacyBookingStatus?: string | null;
  legacy_booking_status?: string | null;
  completionStatus?: string | null;
  outstandingBalanceMinor?: number | null;
  outstanding_balance?: number | null;
  outstandingPrincipalMinor?: number | null;
  outstanding_principal?: number | null;
  outstanding_interest?: number | null;
}): boolean {
  return isLegacyAccountantCompleted(loan) && outstandingBalanceMinor(loan) === 0;
}

export function isLegacyAccountantCompleted(loan: {
  legacyBookingStatus?: string | null;
  legacy_booking_status?: string | null;
  completionStatus?: string | null;
}): boolean {
  const server = String(loan.completionStatus ?? '').trim().toLowerCase();
  if (server === 'completed') return true;
  const status = String(loan.legacyBookingStatus ?? loan.legacy_booking_status ?? '')
    .trim()
    .toLowerCase();
  return TERMINAL_LEGACY_JOURNAL_STATUSES.has(status);
}

export const APPROVED_LEGACY_JOURNAL_STATUSES = new Set([
  'ready_for_accountant_booking',
  'ready_for_accounting',
]);

export const BLOCKED_LEGACY_JOURNAL_STATUSES = new Set([
  'pending_operations_review',
  'ready_for_certification',
  'certification_pending',
]);

export function isReadyForAccountantJournals(loan: {
  legacyBookingStatus?: string | null;
  legacy_booking_status?: string | null;
  certifiedForAccounting?: boolean | null;
  completionStatus?: string | null;
}): boolean {
  if (isLegacyAccountantCompleted(loan)) return false;
  const status = String(loan.legacyBookingStatus ?? loan.legacy_booking_status ?? '')
    .trim()
    .toLowerCase();
  if (BLOCKED_LEGACY_JOURNAL_STATUSES.has(status)) return false;
  if (APPROVED_LEGACY_JOURNAL_STATUSES.has(status)) return true;
  return Boolean(loan.certifiedForAccounting);
}

export function legacyAccountantQueueRank(loan: {
  legacyBookingStatus?: string | null;
  legacy_booking_status?: string | null;
  certifiedForAccounting?: boolean | null;
  completionStatus?: string | null;
}): number {
  if (isLegacyAccountantCompleted(loan)) return 2;
  if (isReadyForAccountantJournals(loan)) return 0;
  return 1;
}

export function sortLegacyBookingCompletedLast<T extends {
  legacyBookingStatus?: string | null;
  legacy_booking_status?: string | null;
  certifiedForAccounting?: boolean | null;
  completionStatus?: string | null;
  outstandingBalanceMinor?: number | null;
  outstanding_balance?: number | null;
  outstandingPrincipalMinor?: number | null;
  outstanding_principal?: number | null;
  outstanding_interest?: number | null;
}>(loans: T[] | null | undefined): T[] {
  return [...(loans ?? [])].sort((a, b) => {
    const byCompletion = legacyAccountantQueueRank(a) - legacyAccountantQueueRank(b);
    if (byCompletion !== 0) return byCompletion;
    const aHasBalance = outstandingBalanceMinor(a) > 0 ? 0 : 1;
    const bHasBalance = outstandingBalanceMinor(b) > 0 ? 0 : 1;
    return aHasBalance - bHasBalance;
  });
}

export type AccountantLegacyCardTone = 'ready' | 'waiting' | 'completed';

export function accountantLegacyCardTone(loan: {
  legacyBookingStatus?: string | null;
  legacy_booking_status?: string | null;
  certifiedForAccounting?: boolean | null;
  completionStatus?: string | null;
}): AccountantLegacyCardTone {
  if (isLegacyAccountantCompleted(loan)) return 'completed';
  if (isReadyForAccountantJournals(loan)) return 'ready';
  return 'waiting';
}

export type LegacyJournalLoanLike = {
  id?: string | number | null;
  applicationNumber?: string | null;
  application_number?: string | null;
  customerName?: string | null;
  client_name?: string | null;
  legacyBookingStatus?: string | null;
  certifiedForAccounting?: boolean | null;
  completionStatus?: string | null;
};

export type BulkJournalItemResult = {
  loanId: number;
  label: string;
  ok: boolean;
  status?: string | null;
  error?: string;
};

export type BulkJournalProgress = {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  current?: { loanId: number; label: string } | null;
  results: BulkJournalItemResult[];
};

export function legacyLoanId(loan: LegacyJournalLoanLike): number | null {
  const raw = Number(loan.id);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function legacyLoanDisplayLabel(loan: LegacyJournalLoanLike): string {
  const ref =
    String(loan.applicationNumber ?? loan.application_number ?? '').trim() ||
    (legacyLoanId(loan) != null ? `LN-${legacyLoanId(loan)}` : 'Loan');
  const name = String(loan.customerName ?? loan.client_name ?? '').trim();
  return name ? `${ref} · ${name}` : ref;
}

export function canSelectLegacyLoanForJournals(loan: LegacyJournalLoanLike): boolean {
  return isReadyForAccountantJournals(loan);
}

export function selectableApprovedLegacyLoans<T extends LegacyJournalLoanLike>(loans: T[]): T[] {
  return loans.filter(canSelectLegacyLoanForJournals);
}

export function bulkJournalPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

export function emptyBulkJournalProgress(total = 0): BulkJournalProgress {
  return {
    total,
    completed: 0,
    succeeded: 0,
    failed: 0,
    current: null,
    results: [],
  };
}

export async function runBulkLegacyJournals<T extends LegacyJournalLoanLike>(opts: {
  loans: T[];
  generate: (loanId: number) => Promise<{ legacy_booking_status?: string | null; status?: string | null } | void>;
  onProgress: (progress: BulkJournalProgress) => void;
}): Promise<BulkJournalProgress> {
  const queue = selectableApprovedLegacyLoans(opts.loans);
  let progress = emptyBulkJournalProgress(queue.length);
  opts.onProgress(progress);

  for (const loan of queue) {
    const loanId = legacyLoanId(loan);
    const label = legacyLoanDisplayLabel(loan);
    progress = { ...progress, current: loanId != null ? { loanId, label } : { loanId: 0, label } };
    opts.onProgress(progress);

    let result: BulkJournalItemResult;
    try {
      if (loanId == null) throw new Error('Invalid loan id');
      const response = await opts.generate(loanId);
      result = {
        loanId,
        label,
        ok: true,
        status: response?.legacy_booking_status || response?.status || 'booked',
      };
    } catch (error) {
      result = {
        loanId: loanId ?? 0,
        label,
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to generate journal entries',
      };
    }

    progress = {
      ...progress,
      completed: progress.completed + 1,
      succeeded: progress.succeeded + (result.ok ? 1 : 0),
      failed: progress.failed + (result.ok ? 0 : 1),
      results: [...progress.results, result],
      current: progress.completed + 1 < progress.total ? progress.current : null,
    };
    opts.onProgress(progress);
  }

  return progress;
}
