import type { Href } from 'expo-router';

import type { OriginationStatus } from '@/lib/data/api';

export type LoanDrawdownEditorStep =
  | 'review'
  | 'create'
  | 'tranches'
  | 'payee'
  | 'approve'
  | 'contract';

export const DRAWDOWN_EDITOR_STEPS: Array<{
  id: LoanDrawdownEditorStep;
  n: number;
  label: string;
  description: string;
}> = [
  { id: 'review', n: 1, label: 'Review', description: 'Review the application file and approved amount.' },
  { id: 'create', n: 2, label: 'Draft', description: 'Create the drawdown draft (imports any legacy draw plan).' },
  { id: 'tranches', n: 3, label: 'Tranches', description: 'Split the principal into scheduled release tranches.' },
  { id: 'payee', n: 4, label: 'Payee', description: 'Confirm the KYC beneficiary who receives the funds.' },
  { id: 'approve', n: 5, label: 'Approve', description: 'Attest, pick the funding pool, and approve the drawdown.' },
  { id: 'contract', n: 6, label: 'Contract', description: 'Generate the contract PDF and hand off to finance.' },
];

export function drawdownStepGuidance(step: LoanDrawdownEditorStep): string {
  const entry = DRAWDOWN_EDITOR_STEPS.find((row) => row.id === step);
  if (!entry) return '';
  return `Step ${entry.n} of ${DRAWDOWN_EDITOR_STEPS.length} — ${entry.description}`;
}

export type LoanDrawdownTrancheDraft = {
  amount_minor: number;
  scheduled_date?: string | null;
  condition?: string | null;
};

export type LoanDrawdownRowLike = {
  id: number;
  status?: string | null;
  ld_number?: string | null;
  contract_number?: string | null;
  beneficiary?: Record<string, unknown> | null;
  draw_tranches?: LoanDrawdownTrancheDraft[] | null;
  verification_attested_at?: string | null;
};

const DRAWDOWN_BLOCKER_CODES = new Set(['LOAN_DRAWDOWN_REQUIRED', 'loan_drawdown_required']);

const BENEFICIARY_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'account_name', label: 'Account name' },
  { key: 'client_name', label: 'Client' },
  { key: 'national_id', label: 'National ID' },
  { key: 'phone_number', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'bank_name', label: 'Bank' },
  { key: 'bank_branch', label: 'Bank branch' },
  { key: 'account_number', label: 'Account number' },
  { key: 'organization_name', label: 'Organization' },
  { key: 'next_of_kin_name', label: 'Next of kin' },
];

export function staffDrawdownEditorHref(applicationId: number): Href {
  return `/(staff)/portfolio-manager/drawdowns/${applicationId}` as Href;
}

export function isOpenLoanDrawdown(row?: LoanDrawdownRowLike | null): boolean {
  if (!row?.id) return false;
  return String(row.status ?? '').toUpperCase() !== 'CANCELLED';
}

export function selectActiveLoanDrawdown(
  rows: LoanDrawdownRowLike[] | null | undefined
): LoanDrawdownRowLike | null {
  const open = (rows ?? []).filter(isOpenLoanDrawdown);
  if (open.length === 0) return null;
  return (
    open.find((row) => String(row.status ?? '').toUpperCase() === 'DRAFT') ??
    open.find((row) => String(row.status ?? '').toUpperCase() === 'APPROVED') ??
    open[0]
  );
}

export function trancheTotalMinor(tranches: LoanDrawdownTrancheDraft[] | null | undefined): number {
  return (tranches ?? []).reduce((sum, tranche) => {
    const amount = Number(tranche.amount_minor);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

export function hasValidTranches(tranches: LoanDrawdownTrancheDraft[] | null | undefined): boolean {
  const rows = (tranches ?? []).filter((tranche) => Number(tranche.amount_minor) > 0);
  return rows.length > 0;
}

export function tranchesMatchApprovedAmount(
  approvedAmountMinor: number | null | undefined,
  tranches: LoanDrawdownTrancheDraft[] | null | undefined
): boolean {
  const approved = Number(approvedAmountMinor ?? 0);
  if (!Number.isFinite(approved) || approved <= 0) return hasValidTranches(tranches);
  return trancheTotalMinor(tranches) === approved;
}

export function kycBeneficiaryHasPayee(
  beneficiary?: Record<string, unknown> | null
): boolean {
  if (!beneficiary || typeof beneficiary !== 'object') return false;
  return ['account_number', 'bank_name', 'account_name', 'national_id'].some((key) =>
    String(beneficiary[key] ?? '').trim()
  );
}

export function beneficiaryDisplayRows(
  beneficiary?: Record<string, unknown> | null
): Array<{ key: string; label: string; value: string }> {
  if (!beneficiary) return [];
  return BENEFICIARY_FIELDS.map(({ key, label }) => ({
    key,
    label,
    value: String(beneficiary[key] ?? '').trim(),
  })).filter((row) => row.value);
}

export function hasLoanDrawdownBlocker(orig?: OriginationStatus | null): boolean {
  const codes = [...(orig?.blockers ?? []), ...(orig?.blocker_details ?? [])].map((value) =>
    String(value).trim()
  );
  return codes.some((value) => {
    const upper = value.toUpperCase().replace(/[\s-]+/g, '_');
    return DRAWDOWN_BLOCKER_CODES.has(value) || DRAWDOWN_BLOCKER_CODES.has(upper) || upper.includes('LOAN_DRAWDOWN');
  });
}

export function computeDrawdownEditorStep(input: {
  hasApplication: boolean;
  drawdown?: LoanDrawdownRowLike | null;
  approvedAmountMinor?: number | null;
}): LoanDrawdownEditorStep {
  if (!input.hasApplication) return 'review';
  if (!isOpenLoanDrawdown(input.drawdown)) return 'create';
  const status = String(input.drawdown?.status ?? '').toUpperCase();
  if (status === 'APPROVED' || status === 'COMPLETED') return 'contract';
  if (!tranchesMatchApprovedAmount(input.approvedAmountMinor, input.drawdown?.draw_tranches)) {
    return 'tranches';
  }
  if (!kycBeneficiaryHasPayee(input.drawdown?.beneficiary)) return 'payee';
  return 'approve';
}

/** Planned vs already-disbursed tranche totals for the progress line. */
export function drawdownTrancheProgress(
  row: LoanDrawdownRowLike | null | undefined,
  approvedAmountMinor?: number | null
): { plannedMinor: number; disbursedMinor: number } {
  const tranches = (row?.draw_tranches ?? []) as Array<{
    amount_minor?: number;
    disbursed_minor?: number;
  }>;
  const planned = tranches.reduce((sum, t) => sum + (Number(t.amount_minor) || 0), 0);
  const disbursed = tranches.reduce((sum, t) => sum + (Number(t.disbursed_minor) || 0), 0);
  return {
    plannedMinor: planned > 0 ? planned : Number(approvedAmountMinor ?? 0),
    disbursedMinor: disbursed,
  };
}

export function unwrapLoanDrawdown(payload: unknown): LoanDrawdownRowLike | null {
  if (!payload || typeof payload !== 'object') return null;
  const rec = payload as Record<string, unknown>;
  if (rec.drawdown && typeof rec.drawdown === 'object') {
    return rec.drawdown as LoanDrawdownRowLike;
  }
  if (typeof rec.id === 'number') return rec as LoanDrawdownRowLike;
  return null;
}

export function normalizeDrawdownList(payload: unknown): LoanDrawdownRowLike[] {
  if (Array.isArray(payload)) return payload.filter((row) => row && typeof row === 'object');
  if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>;
    if (Array.isArray(rec.items)) return rec.items.filter((row) => row && typeof row === 'object');
    const single = unwrapLoanDrawdown(payload);
    return single ? [single] : [];
  }
  return [];
}

export function drawdownStatusLabel(status?: string | null): string {
  const raw = String(status ?? 'DRAFT').trim();
  return raw ? raw.replace(/_/g, ' ') : 'DRAFT';
}
