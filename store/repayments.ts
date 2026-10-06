/**
 * Repayments store.
 * Uses API when USE_API; empty when EXPO_PUBLIC_USE_API=false.
 */

import { create } from 'zustand';
import { useAuthStore } from './auth';
import * as data from '@/lib/data';
import type { ApiRepaymentOverviewItem } from '@/lib/data/api';
import type { Repayment } from './test-data';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

function apiRepaymentToRepayment(r: data.api.ApiRepayment): Repayment {
  const date = typeof r.repayment_date === 'string' ? r.repayment_date.slice(0, 10) : '';
  const amt = r.total_amount ?? r.amount ?? 0;

  // Decide status: for staff, use internal_status if available
  const isStaff = useAuthStore.getState().user?.role !== 'client';
  const displayStatus = isStaff
    ? r.internal_status || r.status || 'COMPLETED'
    : r.status || 'COMPLETED';

  // Never invent a P/I split — show 0 until the API provides a real breakdown.
  return {
    id: r.id,
    loan_id: r.loan_id,
    loan_account_number: r.loan_account_number ?? '',
    amount: amt,
    principal_amount: r.principal_amount ?? 0,
    interest_amount: r.interest_amount ?? 0,
    repayment_date: date,
    status: displayStatus,
    internal_status: r.internal_status,
    lifecycle_state: r.lifecycle_state,
    payment_method: r.payment_method,
    deposit_receipt_number: r.deposit_receipt_number,
    reference_number: r.reference_number,
    created_at: r.created_at,
    updated_at: r.updated_at,
    repayment_schema_version: r.repayment_schema_version,
    member_contributions: r.member_contributions,
    member_contribution_details: r.member_contribution_details,
    sync_status: r.sync_status,
  };
}

interface RepaymentsState {
  repayments: Repayment[];
  awaitingVerification: Repayment[];
  dueToday: ApiRepaymentOverviewItem[];
  overdue: ApiRepaymentOverviewItem[];
  upcoming: ApiRepaymentOverviewItem[];
  loading: boolean;
  hubLoading: boolean;
  lastError: string | null;
  fetchRepayments: (opts?: { search?: string; status?: string }) => Promise<void>;
  fetchHub: (opts?: { search?: string }) => Promise<void>;
  clearError: () => void;
  recordRepayment: (
    loanAccountNumber: string,
    amount: number,
    loanId?: number,
    clientId?: number,
    memberContributions?: Array<{ member_client_id: number; amount: number }>
  ) => Promise<Repayment | null>;
}

function isAwaitingVerification(r: Repayment): boolean {
  const lifecycle = (r.lifecycle_state || '').toUpperCase();
  // Digest + hub Awaiting tab: only ops-pending (not OPERATIONS_VERIFIED / escalated).
  return lifecycle === 'PENDING_OPERATIONS_VERIFICATION';
}

export const useRepaymentsStore = create<RepaymentsState>((set) => ({
  repayments: [],
  awaitingVerification: [],
  dueToday: [],
  overdue: [],
  upcoming: [],
  loading: false,
  hubLoading: false,
  lastError: null,

  clearError: () => set({ lastError: null }),

  fetchRepayments: async (opts) => {
    set({ loading: true, lastError: null });
    const isStaff = useAuthStore.getState().user?.role !== 'client';
    try {
      if (isStaff) {
        const hasFilters = Boolean(opts?.search?.trim() || (opts?.status && opts.status !== 'ALL'));
        const [{ repayments }, awaitingRaw] = await Promise.all([
          hasFilters
            ? data
                .getStaffRepaymentsFiltered({
                  search: opts?.search,
                  status: opts?.status,
                })
                .then((rows) => ({ repayments: rows }))
            : data.getStaffRepayments(),
          data.getStaffAwaitingVerificationRepayments().catch(() => [] as data.api.ApiRepayment[]),
        ]);
        const mapped = repayments.map(apiRepaymentToRepayment);
        // Do not fall back to full history — that inflated Awaiting vs Digest counts.
        let awaitingMapped = awaitingRaw
          .map(apiRepaymentToRepayment)
          .filter(isAwaitingVerification);
        const q = (opts?.search || '').trim().toLowerCase();
        if (q) {
          awaitingMapped = awaitingMapped.filter(
            (r) =>
              (r.loan_account_number || '').toLowerCase().includes(q) ||
              (r.reference_number || '').toLowerCase().includes(q),
          );
        }
        set({
          repayments: mapped,
          awaitingVerification: awaitingMapped,
          loading: false,
        });
      } else {
        const reps = await data.getClientRepayments();
        set({
          repayments: reps.map(apiRepaymentToRepayment),
          awaitingVerification: [],
          loading: false,
        });
      }
    } catch (err) {
      set({
        repayments: [],
        awaitingVerification: [],
        loading: false,
        lastError: errorMessage(err, 'Failed to load repayments'),
      });
    }
  },

  fetchHub: async (opts) => {
    const isStaff = useAuthStore.getState().user?.role !== 'client';
    if (!isStaff) {
      set({ dueToday: [], overdue: [], upcoming: [] });
      return;
    }
    set({ hubLoading: true, lastError: null });
    try {
      const hub = await data.getStaffRepaymentHub({ search: opts?.search });
      set({
        dueToday: hub.dueToday,
        overdue: hub.overdue,
        upcoming: hub.upcoming,
        hubLoading: false,
      });
    } catch (err) {
      set({
        dueToday: [],
        overdue: [],
        upcoming: [],
        hubLoading: false,
        lastError: errorMessage(err, 'Failed to load repayment hub'),
      });
    }
  },

  recordRepayment: async (loanAccountNumber, amount, loanId, clientId, memberContributions) => {
    if (loanId == null || clientId == null) {
      set({ lastError: 'Missing loan or client for repayment' });
      return null;
    }
    // Engine allocates P/I on confirm — do not invent a client-side split.
    const principalAmount = 0;
    const interestAmount = 0;
    try {
      const created = await data.createRepayment(
        loanId,
        clientId,
        amount,
        principalAmount,
        interestAmount,
        loanAccountNumber,
        memberContributions
      );
      if (created) {
        const rep = apiRepaymentToRepayment({
          ...created,
          loan_account_number: loanAccountNumber,
          status: created.status ?? 'PENDING',
          internal_status: created.internal_status ?? 'PENDING',
        });
        set((s) => ({ repayments: [rep, ...s.repayments], lastError: null }));
        return rep;
      }
      set({ lastError: 'Failed to record payment' });
    } catch (err) {
      set({ lastError: errorMessage(err, 'Failed to record payment') });
    }
    return null;
  },
}));
