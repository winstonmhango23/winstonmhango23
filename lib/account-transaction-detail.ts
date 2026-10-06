/**
 * Borrower account activity detail helpers (portal transaction-detail parity).
 */

export type AccountTxnKind = 'deposit' | 'withdrawal' | 'transfer';

export type AccountTxnRow = {
  kind: AccountTxnKind;
  id: number;
  ref: string;
  amount_minor: number;
  status: string;
  created_at: string;
  rejection_reason?: string | null;
  notes?: string | null;
};

export type AccountTxnTimelineEntry = { label: string; at: string };

export type DepositTxnDetail = {
  kind: 'deposit';
  account_id?: number;
  deposit_method?: string;
  reference_number?: string | null;
  currency?: string;
  submitted_at?: string | null;
  verified_at?: string | null;
  posted_at?: string | null;
  rejected_at?: string | null;
  manager_approved_at?: string | null;
};

export type WithdrawalTxnDetail = {
  kind: 'withdrawal';
  account_id?: number;
  withdrawal_method?: string;
  reference_number?: string | null;
  currency?: string;
  submitted_at?: string | null;
  verified_at?: string | null;
  posted_at?: string | null;
  rejected_at?: string | null;
  manager_approved_at?: string | null;
};

export type TransferTxnDetail = {
  kind: 'transfer';
  source_account_id?: number;
  destination_account_id?: number;
  transfer_purpose?: string | null;
  loan_id?: number | null;
  currency?: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  executed_at?: string | null;
  rejected_at?: string | null;
  reversed_at?: string | null;
  reversal_reason?: string | null;
};

export type AccountTxnExtraDetail = DepositTxnDetail | WithdrawalTxnDetail | TransferTxnDetail;

export function transactionKindLabel(kind: AccountTxnKind): string {
  if (kind === 'deposit') return 'Deposit';
  if (kind === 'withdrawal') return 'Withdrawal';
  return 'Transfer';
}

export function formatTxnStatus(status: string): string {
  return String(status || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTxnDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function buildAccountTxnTimeline(
  row: AccountTxnRow,
  detail: AccountTxnExtraDetail | null
): AccountTxnTimelineEntry[] {
  const entries: AccountTxnTimelineEntry[] = [];
  const push = (label: string, at?: string | null) => {
    if (at) entries.push({ label, at });
  };

  push('Created', row.created_at);

  if (detail?.kind === 'deposit') {
    push('Submitted', detail.submitted_at);
    push('Verified', detail.verified_at);
    push('Manager approved', detail.manager_approved_at);
    push('Posted', detail.posted_at);
    push('Rejected', detail.rejected_at);
  } else if (detail?.kind === 'withdrawal') {
    push('Submitted', detail.submitted_at);
    push('Verified', detail.verified_at);
    push('Manager approved', detail.manager_approved_at);
    push('Posted', detail.posted_at);
    push('Rejected', detail.rejected_at);
  } else if (detail?.kind === 'transfer') {
    push('Submitted', detail.submitted_at);
    push('Approved', detail.approved_at);
    push('Completed', detail.executed_at);
    push('Rejected', detail.rejected_at);
    push('Reversed', detail.reversed_at);
  }

  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function depositToDetail(d: {
  account_id?: number;
  deposit_method?: string;
  reference_number?: string | null;
  currency?: string;
  submitted_at?: string | null;
  verified_at?: string | null;
  posted_at?: string | null;
  rejected_at?: string | null;
  manager_approved_at?: string | null;
}): DepositTxnDetail {
  return {
    kind: 'deposit',
    account_id: d.account_id,
    deposit_method: d.deposit_method,
    reference_number: d.reference_number ?? null,
    currency: d.currency,
    submitted_at: d.submitted_at ?? null,
    verified_at: d.verified_at ?? null,
    posted_at: d.posted_at ?? null,
    rejected_at: d.rejected_at ?? null,
    manager_approved_at: d.manager_approved_at ?? null,
  };
}

export function withdrawalToDetail(w: {
  account_id?: number;
  withdrawal_method?: string;
  reference_number?: string | null;
  currency?: string;
  submitted_at?: string | null;
  verified_at?: string | null;
  posted_at?: string | null;
  rejected_at?: string | null;
  manager_approved_at?: string | null;
}): WithdrawalTxnDetail {
  return {
    kind: 'withdrawal',
    account_id: w.account_id,
    withdrawal_method: w.withdrawal_method,
    reference_number: w.reference_number ?? null,
    currency: w.currency,
    submitted_at: w.submitted_at ?? null,
    verified_at: w.verified_at ?? null,
    posted_at: w.posted_at ?? null,
    rejected_at: w.rejected_at ?? null,
    manager_approved_at: w.manager_approved_at ?? null,
  };
}

export function transferToDetail(t: {
  source_account_id?: number;
  destination_account_id?: number;
  transfer_purpose?: string | null;
  loan_id?: number | null;
  currency?: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  executed_at?: string | null;
  rejected_at?: string | null;
  reversed_at?: string | null;
  reversal_reason?: string | null;
}): TransferTxnDetail {
  return {
    kind: 'transfer',
    source_account_id: t.source_account_id,
    destination_account_id: t.destination_account_id,
    transfer_purpose: t.transfer_purpose ?? null,
    loan_id: t.loan_id ?? null,
    currency: t.currency,
    submitted_at: t.submitted_at ?? null,
    approved_at: t.approved_at ?? null,
    executed_at: t.executed_at ?? null,
    rejected_at: t.rejected_at ?? null,
    reversed_at: t.reversed_at ?? null,
    reversal_reason: t.reversal_reason ?? null,
  };
}
