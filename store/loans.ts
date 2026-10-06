/**
 * Loans store.
 * Uses API when USE_API; empty when EXPO_PUBLIC_USE_API=false.
 */

import { create } from 'zustand';
import { useAuthStore } from './auth';
import * as data from '@/lib/data';
import { isCreditOfficerStaffRole, isLoanOfficerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { emptyBookTotals, readBookTotals, type StaffBookTotals } from '@/lib/staff/loan-book-filters';
import type { Loan, ScheduleEntry } from './test-data';

function apiLoanToLoan(l: data.api.ApiLoan): Loan {
  return {
    id: l.id,
    loan_account_number: l.loan_account_number,
    client_name: l.client_name ?? '',
    client_id: l.client_id ?? undefined,
    product_name: l.product_name ?? 'Loan',
    loan_product_id: l.loan_product_id,
    principal_amount: l.principal_amount,
    outstanding_principal: l.outstanding_principal,
    total_repaid: l.total_repaid ?? 0,
    status: l.status,
    next_due_date: l.next_due_date,
    days_in_arrears: l.days_in_arrears ?? 0,
    interest_rate: l.interest_rate ?? 0,
    term_months: l.term_months ?? 12,
    days_until_next_repayment: l.days_until_next_repayment ?? null,
    repayment_tracking_live: l.repayment_tracking_live,
    application_origination_stage: l.application_origination_stage ?? null,
    is_group_facility: l.is_group_facility,
    my_share_principal_minor: l.my_share_principal_minor ?? null,
    group_principal_minor: l.group_principal_minor ?? null,
    my_share_outstanding_minor: l.my_share_outstanding_minor ?? null,
    allocation_id: l.allocation_id ?? null,
    funding_fund_name: l.funding_fund_name ?? null,
    investment_assigned: l.investment_assigned ?? null,
    is_legacy: l.is_legacy,
    legacy_booking_status: l.legacy_booking_status ?? null,
    loan_application_id: l.loan_application_id ?? null,
  };
}

/** Generate flat-rate schedule (principal + interest per installment) */
export function generateSchedule(loan: Loan): ScheduleEntry[] {
  const { principal_amount, interest_rate, term_months } = loan;
  const annualRate = interest_rate / 10000; // e.g. 1200 -> 12%
  const monthlyRate = annualRate / 12;
  const schedule: ScheduleEntry[] = [];
  let balance = principal_amount;
  const monthlyPayment = principal_amount * (monthlyRate * Math.pow(1 + monthlyRate, term_months)) / (Math.pow(1 + monthlyRate, term_months) - 1);

  const start = new Date();
  for (let i = 1; i <= term_months; i++) {
    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + i);
    const interestAmount = Math.round(balance * monthlyRate);
    const principalAmount = Math.round(Math.min(monthlyPayment - interestAmount, balance));
    balance -= principalAmount;
    schedule.push({
      installmentNumber: i,
      dueDate: dueDate.toISOString().slice(0, 10),
      principalAmount,
      interestAmount,
      totalAmount: principalAmount + interestAmount,
      remainingBalance: Math.max(0, balance),
      status: 'pending',
    });
  }
  return schedule;
}

function apiScheduleToEntry(s: data.api.ApiScheduleItem, index: number): ScheduleEntry {
  const dueDate = typeof s.due_date === 'string' ? s.due_date.slice(0, 10) : '';
  return {
    installmentNumber: s.installment_number ?? index + 1,
    dueDate,
    principalAmount: s.principal_amount ?? 0,
    interestAmount: s.interest_amount ?? 0,
    totalAmount: s.total_amount ?? 0,
    remainingBalance: 0,
    status: (s.status?.toLowerCase() === 'paid' || (s.paid_amount ?? 0) > 0 ? 'paid' : 'pending') as 'pending' | 'paid',
  };
}

export type FetchLoansOpts = {
  creditBook?: string;
  isAgricultural?: boolean;
  isLegacy?: boolean;
  legacyQueue?: 'active' | 'archive' | 'needs_verification' | 'sent_to_accountant';
  includeFundingPreview?: boolean;
  hasBalance?: boolean;
  page?: number;
  limit?: number;
  append?: boolean;
};

interface LoansState {
  loans: Loan[];
  loading: boolean;
  loadingMore: boolean;
  lastSyncedAt: string | null;
  total: number;
  page: number;
  pages: number;
  bookTotals: StaffBookTotals;
  fetchLoans: (opts?: FetchLoansOpts) => Promise<void>;
  /** Staff only: fetch loans for clients assigned to the logged-in staff member */
  fetchStaffAssignedLoans: (opts?: FetchLoansOpts) => Promise<void>;
  updateLoan: (loanId: number, patch: Partial<Loan>) => void;
  getSchedule: (loanId: number) => ScheduleEntry[];
  fetchSchedule: (loanId: number) => Promise<ScheduleEntry[]>;
}

export const useLoansStore = create<LoansState>((set, get) => ({
  loans: [],
  loading: false,
  loadingMore: false,
  lastSyncedAt: null,
  total: 0,
  page: 1,
  pages: 1,
  bookTotals: emptyBookTotals(),

  fetchLoans: async (opts) => {
    const page = opts?.page ?? 1;
    const append = Boolean(opts?.append && page > 1);
    set(append ? { loadingMore: true } : { loading: true });
    const user = useAuthStore.getState().user;
    const isStaff = user?.role !== 'client';
    const isCio = isCreditOfficerStaffRole(user?.backendRole ?? user?.role);
    const assignedOnly =
      isStaff && !isCio && isLoanOfficerStaffRole(user?.backendRole ?? user?.role);
    try {
      const result = await data.getLoansPage(isStaff, {
        assignedOnly: assignedOnly || undefined,
        supervisedOnly: isStaff && isCio ? true : undefined,
        creditBook: opts?.creditBook,
        isAgricultural: opts?.isAgricultural,
        isLegacy: opts?.isLegacy,
        legacyQueue: opts?.legacyQueue,
        includeFundingPreview: opts?.includeFundingPreview,
        hasBalance: opts?.hasBalance,
        page,
        limit: opts?.limit ?? 20,
      });
      const lastSyncedAt = await data.getLoansLastSyncedAt();
      const mapped = result.data.map(apiLoanToLoan);
      set({
        loans: append ? [...get().loans, ...mapped] : mapped,
        loading: false,
        loadingMore: false,
        lastSyncedAt,
        total: result.total,
        page: result.page,
        pages: result.pages,
        bookTotals: readBookTotals(result.book_totals),
      });
    } catch {
      const lastSyncedAt = await data.getLoansLastSyncedAt();
      set({ loading: false, loadingMore: false, lastSyncedAt });
    }
  },

  fetchStaffAssignedLoans: async (opts) => {
    await get().fetchLoans(opts);
  },

  updateLoan: (loanId, patch) => {
    set({
      loans: get().loans.map((loan) => (loan.id === loanId ? { ...loan, ...patch } : loan)),
    });
  },

  getSchedule: (loanId) => {
    const loan = get().loans.find((l) => l.id === loanId);
    if (!loan) return [];
    return generateSchedule(loan);
  },

  fetchSchedule: async (loanId) => {
    try {
      const items = await data.getLoanSchedule(loanId);
      return (items ?? []).map((s, i) => apiScheduleToEntry(s, i));
    } catch {
      const loan = get().loans.find((l) => l.id === loanId);
      return loan ? generateSchedule(loan) : [];
    }
  },
}));
