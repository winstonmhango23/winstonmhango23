/**
 * Borrower accounts store — mobile/me deposits, transfers, withdrawals, collateral.
 */

import { create } from 'zustand';
import * as data from '@/lib/data';
import type {
  ApiBankAccount,
  ApiCollateralBalance,
  ApiCollateralLoanLockSummary,
  ApiInternalTransfer,
  ApiSavingsDeposit,
  ApiSavingsWithdrawal,
} from '@/lib/data';
import type { AccountTxnRow } from '@/lib/account-transaction-detail';

export type AccountActivityItem = AccountTxnRow;

interface AccountsState {
  accounts: ApiBankAccount[];
  collateralBalance: ApiCollateralBalance | null;
  collateralLocks: ApiCollateralLoanLockSummary[];
  deposits: ApiSavingsDeposit[];
  withdrawals: ApiSavingsWithdrawal[];
  transfers: ApiInternalTransfer[];
  activity: AccountActivityItem[];
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  submitDeposit: (input: {
    account_id: number;
    amount_minor: number;
    deposit_method?: string;
    reference_number?: string;
    notes?: string;
    receipt_path?: string;
    receipt_metadata?: Record<string, unknown>;
    receipt_local_uri?: string;
    receipt_file_name?: string;
  }) => Promise<void>;
  submitWithdrawal: (input: {
    account_id: number;
    amount_minor: number;
    withdrawal_method?: string;
    reference_number?: string;
    notes?: string;
  }) => Promise<void>;
  submitTransfer: (input: {
    source_account_id: number;
    destination_account_id: number;
    amount_minor: number;
    transfer_purpose?: string;
    loan_id?: number;
    notes?: string;
  }) => Promise<void>;
  fundCollateral: (input: { source_account_id: number; amount_minor: number }) => Promise<void>;
}

function mergeActivity(
  deposits: ApiSavingsDeposit[],
  withdrawals: ApiSavingsWithdrawal[],
  transfers: ApiInternalTransfer[]
): AccountActivityItem[] {
  const rows: AccountActivityItem[] = [
    ...deposits.map((d) => ({
      kind: 'deposit' as const,
      id: d.id,
      ref: d.deposit_number,
      amount_minor: d.amount_minor,
      status: d.status,
      created_at: d.created_at,
      rejection_reason: d.rejection_reason ?? null,
      notes: d.notes ?? null,
    })),
    ...withdrawals.map((w) => ({
      kind: 'withdrawal' as const,
      id: w.id,
      ref: w.withdrawal_number,
      amount_minor: w.amount_minor,
      status: w.status,
      created_at: w.created_at,
      rejection_reason: w.rejection_reason ?? null,
      notes: w.notes ?? null,
    })),
    ...transfers.map((t) => ({
      kind: 'transfer' as const,
      id: t.id,
      ref: t.transfer_number,
      amount_minor: t.amount_minor,
      status: t.status,
      created_at: t.created_at,
      rejection_reason: t.rejection_reason ?? null,
      notes: t.notes ?? null,
    })),
  ];
  return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export const useAccountsStore = create<AccountsState>((set) => ({
  accounts: [],
  collateralBalance: null,
  collateralLocks: [],
  deposits: [],
  withdrawals: [],
  transfers: [],
  activity: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      // Match web client-portal: accounts are the critical fetch. Collateral and
      // transaction history are best-effort so secondary endpoint failures do not
      // hide auto-created MAIN / REPAYMENT / collateral / loan accounts.
      const accounts = await data.getClientAccounts();
      const [collateralBalance, collateralLocks, activityBundle] = await Promise.all([
        data.getClientCollateralBalance(),
        data.getClientCollateralLocks(),
        data.getClientAccountActivity(),
      ]);
      const { deposits, withdrawals, transfers } = activityBundle;
      set({
        accounts: Array.isArray(accounts) ? accounts : [],
        collateralBalance,
        collateralLocks,
        deposits,
        withdrawals,
        transfers,
        activity: mergeActivity(deposits, withdrawals, transfers),
        loading: false,
        error: null,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load accounts',
      });
    }
  },

  submitDeposit: async (input) => {
    await data.submitClientDeposit(input);
    await useAccountsStore.getState().fetchAll();
  },

  submitWithdrawal: async (input) => {
    await data.submitClientWithdrawal(input);
    await useAccountsStore.getState().fetchAll();
  },

  submitTransfer: async (input) => {
    await data.submitClientTransfer(input);
    await useAccountsStore.getState().fetchAll();
  },

  fundCollateral: async (input) => {
    await data.fundClientCollateral(input);
    await useAccountsStore.getState().fetchAll();
  },
}));
