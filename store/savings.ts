/**
 * Staff savings store — thin wrappers around per-client savings APIs.
 * Prefer client Accounts screen / quick deposit & withdrawal for ops UI.
 */

import { create } from 'zustand';
import { getStoredAuth } from '@/lib/storage';
import * as savingsApi from '@/lib/data/savings-api';

interface SavingsState {
  accounts: savingsApi.ApiStaffSavingsAccount[];
  deposits: savingsApi.ApiStaffSavingsDeposit[];
  withdrawals: savingsApi.ApiStaffSavingsWithdrawal[];
  loading: boolean;
  /** @deprecated No list-all accounts endpoint — use getStaffClientAccounts(clientId). */
  fetchAccounts: () => Promise<void>;
  fetchClientAccounts: (clientId: number) => Promise<void>;
  fetchClientDeposits: (clientId: number) => Promise<void>;
  fetchClientWithdrawals: (clientId: number) => Promise<void>;
  createDeposit: (data: {
    account_id: number;
    client_id: number;
    amount_minor: number;
    deposit_method?: string;
    notes?: string;
    reference_number?: string;
    receipt_path?: string;
    receipt_metadata?: Record<string, unknown>;
  }) => Promise<savingsApi.ApiStaffSavingsDeposit | null>;
  createWithdrawal: (data: {
    account_id: number;
    client_id: number;
    amount_minor: number;
    withdrawal_method?: string;
    notes?: string;
  }) => Promise<savingsApi.ApiStaffSavingsWithdrawal | null>;
}

export const useSavingsStore = create<SavingsState>((set) => ({
  accounts: [],
  deposits: [],
  withdrawals: [],
  loading: false,

  fetchAccounts: async () => {
    set({ accounts: [], loading: false });
  },

  fetchClientAccounts: async (clientId) => {
    set({ loading: true });
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const accounts = await savingsApi.apiGetClientAccounts(auth.token, clientId);
      set({ accounts });
    } catch {
      set({ accounts: [] });
    } finally {
      set({ loading: false });
    }
  },

  fetchClientDeposits: async (clientId) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const deposits = await savingsApi.apiGetStaffClientDeposits(auth.token, clientId);
      set({ deposits });
    } catch {
      set({ deposits: [] });
    }
  },

  fetchClientWithdrawals: async (clientId) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const withdrawals = await savingsApi.apiGetStaffClientWithdrawals(auth.token, clientId);
      set({ withdrawals });
    } catch {
      set({ withdrawals: [] });
    }
  },

  createDeposit: async (data) => {
    const auth = await getStoredAuth();
    if (!auth?.token) return null;
    const result = await savingsApi.apiCreateAndSubmitStaffDeposit(auth.token, data);
    if (result) {
      set((s) => ({ deposits: [result, ...s.deposits] }));
    }
    return result;
  },

  createWithdrawal: async (data) => {
    const auth = await getStoredAuth();
    if (!auth?.token) return null;
    const result = await savingsApi.apiCreateAndSubmitStaffWithdrawal(auth.token, data);
    if (result) {
      set((s) => ({ withdrawals: [result, ...s.withdrawals] }));
    }
    return result;
  },
}));
