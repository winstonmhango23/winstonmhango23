/**
 * Borrower accounts API — /mobile/me/* (deposits, transfers, withdrawals, collateral).
 */

import { api } from '@/lib/api-client';
import { config } from '@/lib/config';

export type ApiBankAccount = {
  id: number;
  client_id: number;
  account_number: string;
  account_type: string;
  account_category?: string | null;
  balance: number;
  currency: string;
  status: string;
  auto_generated: boolean;
  /** Book + pending repayments + pending deposits (when API enriches). */
  effective_balance?: number | null;
  pending_repayment_amount?: number | null;
  pending_repayment_count?: number | null;
  pending_deposit_amount?: number | null;
  pending_deposit_count?: number | null;
};

export type ApiSavingsDeposit = {
  id: number;
  deposit_number: string;
  account_id: number;
  amount_minor: number;
  currency: string;
  deposit_method: string;
  reference_number?: string | null;
  status: string;
  submitted_at?: string | null;
  verified_at?: string | null;
  posted_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  manager_approved_at?: string | null;
  notes?: string | null;
  created_at: string;
};

export type ApiSavingsWithdrawal = {
  id: number;
  withdrawal_number: string;
  account_id: number;
  amount_minor: number;
  currency: string;
  withdrawal_method: string;
  reference_number?: string | null;
  status: string;
  submitted_at?: string | null;
  verified_at?: string | null;
  posted_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  manager_approved_at?: string | null;
  notes?: string | null;
  created_at: string;
};

export type ApiInternalTransfer = {
  id: number;
  transfer_number: string;
  source_account_id: number;
  destination_account_id: number;
  amount_minor: number;
  currency: string;
  transfer_purpose?: string | null;
  loan_id?: number | null;
  notes?: string | null;
  status: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  executed_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  created_at: string;
};

export type ApiCollateralBalance = {
  total_balance: number;
  locked_balance: number;
  available_balance: number;
  account_id?: number | null;
  account_number?: string | null;
};

export type ApiCollateralLockItem = {
  lock_id: number;
  account_id: number;
  locked_amount: number;
  lock_status: string;
  lock_timestamp?: string | null;
  release_timestamp?: string | null;
  release_amount?: number | null;
};

export type ApiCollateralLoanLockSummary = {
  loan_id: number;
  loan_account_number?: string | null;
  loan_status?: string | null;
  total_locked: number;
  total_released: number;
  currently_locked: number;
  lock_count: number;
  locks: ApiCollateralLockItem[];
};

export type ApiCollateralFundResult = {
  transfer_id: number;
  transfer_number?: string | null;
  status?: string | null;
  amount_minor: number;
  destination_account_number: string;
  message: string;
  balance: ApiCollateralBalance;
};

async function submitDeposit(token: string, id: number): Promise<ApiSavingsDeposit> {
  return api.post<ApiSavingsDeposit>(`${config.mobileMe.deposits}/${id}/submit`, {}, token);
}

async function submitWithdrawal(token: string, id: number): Promise<ApiSavingsWithdrawal> {
  return api.post<ApiSavingsWithdrawal>(`${config.mobileMe.withdrawals}/${id}/submit`, {}, token);
}

async function submitTransfer(token: string, id: number): Promise<ApiInternalTransfer> {
  return api.post<ApiInternalTransfer>(`${config.mobileMe.transfers}/${id}/submit`, {}, token);
}

export async function apiGetMobileAccounts(token: string): Promise<ApiBankAccount[]> {
  const res = await api.get<ApiBankAccount[]>(config.mobileMe.accounts, token);
  return Array.isArray(res) ? res : [];
}

export async function apiGetMobileDeposits(token: string): Promise<ApiSavingsDeposit[]> {
  const res = await api.get<ApiSavingsDeposit[]>(`${config.mobileMe.deposits}?limit=50`, token);
  return res ?? [];
}

export async function apiGetMobileWithdrawals(token: string): Promise<ApiSavingsWithdrawal[]> {
  const res = await api.get<ApiSavingsWithdrawal[]>(`${config.mobileMe.withdrawals}?limit=50`, token);
  return res ?? [];
}

export async function apiGetMobileTransfers(token: string): Promise<ApiInternalTransfer[]> {
  const res = await api.get<ApiInternalTransfer[]>(`${config.mobileMe.transfers}?limit=50`, token);
  return res ?? [];
}

export async function apiGetMobileCollateralBalance(token: string): Promise<ApiCollateralBalance> {
  return api.get<ApiCollateralBalance>(config.mobileMe.collateralBalance, token);
}

export async function apiGetMobileCollateralLocks(token: string): Promise<ApiCollateralLoanLockSummary[]> {
  const res = await api.get<ApiCollateralLoanLockSummary[]>(config.mobileMe.collateralLocks, token);
  return res ?? [];
}

export async function apiCreateAndSubmitDeposit(
  token: string,
  body: {
    account_id: number;
    amount_minor: number;
    deposit_method?: string;
    reference_number?: string;
    notes?: string;
    receipt_path?: string;
    receipt_metadata?: Record<string, unknown>;
  }
): Promise<ApiSavingsDeposit> {
  const created = await api.post<ApiSavingsDeposit>(
    config.mobileMe.deposits,
    {
      deposit_method: body.deposit_method ?? 'CASH',
      account_id: body.account_id,
      amount_minor: body.amount_minor,
      reference_number: body.reference_number,
      notes: body.notes,
      receipt_path: body.receipt_path,
      receipt_metadata: body.receipt_metadata,
    },
    token
  );
  return submitDeposit(token, created.id);
}

export async function apiCreateAndSubmitWithdrawal(
  token: string,
  body: {
    account_id: number;
    amount_minor: number;
    withdrawal_method?: string;
    reference_number?: string;
    notes?: string;
  }
): Promise<ApiSavingsWithdrawal> {
  const created = await api.post<ApiSavingsWithdrawal>(
    config.mobileMe.withdrawals,
    {
      withdrawal_method: body.withdrawal_method ?? 'CASH',
      ...body,
    },
    token
  );
  return submitWithdrawal(token, created.id);
}

export async function apiCreateAndSubmitTransfer(
  token: string,
  body: {
    source_account_id: number;
    destination_account_id: number;
    amount_minor: number;
    transfer_purpose?: string;
    loan_id?: number;
    notes?: string;
  }
): Promise<ApiInternalTransfer> {
  const created = await api.post<ApiInternalTransfer>(
    config.mobileMe.transfers,
    {
      transfer_purpose: body.transfer_purpose ?? 'GENERAL',
      source_account_id: body.source_account_id,
      destination_account_id: body.destination_account_id,
      amount_minor: body.amount_minor,
      loan_id: body.loan_id,
      notes: body.notes,
    },
    token
  );
  return submitTransfer(token, created.id);
}

export type MobileLoanOption = {
  id: number;
  loan_account_number?: string | null;
  outstanding_principal?: number;
  outstanding_interest?: number;
  status?: string | null;
};

export async function apiGetMobileLoanOptionsForTransfer(token: string): Promise<MobileLoanOption[]> {
  const progress = await api.get<{ my_loans?: MobileLoanOption[] }>(
    `${config.apiBase}/mobile/me/loan-progress`,
    token
  );
  return Array.isArray(progress?.my_loans) ? progress.my_loans : [];
}

export async function apiFundMobileCollateral(
  token: string,
  body: { source_account_id: number; amount_minor: number }
): Promise<ApiCollateralFundResult> {
  return api.post<ApiCollateralFundResult>(config.mobileMe.collateralFund, body, token);
}
