import { create } from 'zustand';
import { useLoansStore } from '@/store/loans';
import { useClientsStore } from '@/store/clients';
import { useCollectionsStore } from '@/store/collections';
import type { Loan } from '@/store/test-data';

export interface PortfolioSummary {
  totalDisbursed: number;
  outstandingPrincipal: number;
  totalOverdue: number;
  activeLoanCount: number;
  overdueLoanCount: number;
  defaultedLoanCount: number;
  /** Outstanding of loans with DPD ≥ 30 (LMS PAR30 amount). */
  par30: number;
  par60: number;
  par90: number;
  /** Amount-weighted PAR % of live outstanding. */
  par30Pct: number;
  par60Pct: number;
  par90Pct: number;
  loansPastDueCount: number;
}

export interface LoanStatusDistribution {
  status: string;
  count: number;
  totalAmount: number;
  percentage: number;
}

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number;
  count: number;
  amount: number;
  color: string;
}

export interface ClientSegment {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface ReportData {
  summary: PortfolioSummary;
  statusDistribution: LoanStatusDistribution[];
  aging: AgingBucket[];
  clientSegments: ClientSegment[];
  loading: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
}

function loanPrincipal(l: Loan): number {
  return Number(l.principal_amount ?? 0) || 0;
}

function loanOutstanding(l: Loan): number {
  return Number(l.outstanding_principal ?? 0) || 0;
}

function loanDpd(l: Loan): number {
  return Math.max(0, Number(l.days_in_arrears ?? 0) || 0);
}

function isBookedLoan(l: Loan): boolean {
  const s = (l.status || '').toUpperCase();
  return ['ACTIVE', 'DISBURSED', 'DELINQUENT', 'DEFAULTED', 'OVERDUE'].includes(s);
}

function emptySummary(): PortfolioSummary {
  return {
    totalDisbursed: 0,
    outstandingPrincipal: 0,
    totalOverdue: 0,
    activeLoanCount: 0,
    overdueLoanCount: 0,
    defaultedLoanCount: 0,
    par30: 0,
    par60: 0,
    par90: 0,
    par30Pct: 0,
    par60Pct: 0,
    par90Pct: 0,
    loansPastDueCount: 0,
  };
}

export const useReportsStore = create<ReportData>((set) => ({
  summary: emptySummary(),
  statusDistribution: [],
  aging: [],
  clientSegments: [],
  loading: false,
  lastError: null,

  refresh: async () => {
    set({ loading: true, lastError: null });
    try {
      await Promise.allSettled([
        useLoansStore.getState().fetchLoans(),
        useClientsStore.getState().fetchClients(),
        useCollectionsStore.getState().fetchStats(),
        useCollectionsStore.getState().fetchDelinquentLoans(),
      ]);

      const loans = useLoansStore.getState().loans;
      const clients = useClientsStore.getState().clients;
      const delinquent = useCollectionsStore.getState().delinquentLoans;

      const booked = loans.filter(isBookedLoan);
      const activeLoans = loans.filter((l) => {
        const s = (l.status || '').toUpperCase();
        return s === 'ACTIVE' || s === 'DISBURSED';
      });
      const defaultedLoans = loans.filter((l) => (l.status || '').toUpperCase() === 'DEFAULTED');
      const pastDueLoans = booked.filter((l) => loanDpd(l) > 0);

      const totalDisbursed = booked.reduce((s, l) => s + loanPrincipal(l), 0);
      const outstandingPrincipal = booked.reduce((s, l) => s + loanOutstanding(l), 0);
      const totalOverdue =
        delinquent.length > 0
          ? delinquent.reduce((s, d) => s + Number(d.overdue_amount ?? 0), 0)
          : pastDueLoans.reduce((s, l) => s + loanOutstanding(l), 0);

      const parAmount = (minDpd: number) =>
        booked
          .filter((l) => loanDpd(l) >= minDpd)
          .reduce((s, l) => s + loanOutstanding(l), 0);

      const par30 = parAmount(30);
      const par60 = parAmount(60);
      const par90 = parAmount(90);
      const den = outstandingPrincipal > 0 ? outstandingPrincipal : 0;
      const pct = (num: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

      set({
        summary: {
          totalDisbursed,
          outstandingPrincipal,
          totalOverdue,
          activeLoanCount: activeLoans.length,
          overdueLoanCount: pastDueLoans.length,
          defaultedLoanCount: defaultedLoans.length,
          par30,
          par60,
          par90,
          par30Pct: pct(par30),
          par60Pct: pct(par60),
          par90Pct: pct(par90),
          loansPastDueCount: pastDueLoans.length,
        },
      });

      const statusGroups: Record<string, { count: number; total: number }> = {};
      for (const l of loans) {
        const s = (l.status ?? 'UNKNOWN').toUpperCase();
        if (!statusGroups[s]) statusGroups[s] = { count: 0, total: 0 };
        statusGroups[s].count++;
        statusGroups[s].total += loanOutstanding(l) || loanPrincipal(l);
      }
      const totalLoanAmount = Object.values(statusGroups).reduce((s, g) => s + g.total, 0);
      const statusDistribution = Object.entries(statusGroups)
        .map(([status, g]) => ({
          status,
          count: g.count,
          totalAmount: g.total,
          percentage: totalLoanAmount > 0 ? Math.round((g.total / totalLoanAmount) * 100) : 0,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      const agingBuckets: AgingBucket[] = [
        { label: 'Current (0–29d)', minDays: 0, maxDays: 29, count: 0, amount: 0, color: '#22c55e' },
        { label: 'Watch (30–59d)', minDays: 30, maxDays: 59, count: 0, amount: 0, color: '#f59e0b' },
        { label: 'Substandard (60–89d)', minDays: 60, maxDays: 89, count: 0, amount: 0, color: '#f97316' },
        { label: 'Doubtful (90–179d)', minDays: 90, maxDays: 179, count: 0, amount: 0, color: '#ef4444' },
        { label: 'Loss (180d+)', minDays: 180, maxDays: 99999, count: 0, amount: 0, color: '#7f1d1d' },
      ];

      // Prefer loan DPD + outstanding (canonical book) over collections-only delinquent list.
      for (const l of booked) {
        const dpd = loanDpd(l);
        const amt = loanOutstanding(l);
        for (const b of agingBuckets) {
          if (dpd >= b.minDays && dpd <= b.maxDays) {
            b.count += 1;
            b.amount += amt;
            break;
          }
        }
      }

      // If loan DPD is sparse, merge collections delinquent into non-current buckets.
      if (booked.every((l) => loanDpd(l) === 0) && delinquent.length > 0) {
        for (const b of agingBuckets) {
          if (b.minDays === 0) continue;
          b.count = 0;
          b.amount = 0;
        }
        agingBuckets[0].count = Math.max(0, activeLoans.length);
        agingBuckets[0].amount = Math.max(0, outstandingPrincipal - totalOverdue);
        for (const d of delinquent) {
          const dpd = Number(d.days_in_arrears ?? 0);
          for (const b of agingBuckets) {
            if (dpd >= b.minDays && dpd <= b.maxDays) {
              b.count += 1;
              b.amount += Number(d.overdue_amount ?? 0);
              break;
            }
          }
        }
      }

      set({
        statusDistribution,
        aging: agingBuckets,
      });

      const verified = clients.filter((c) => c.isVerified).length;
      const unverified = clients.filter((c) => !c.isVerified).length;
      const withLoans = new Set(
        booked.map((l) => l.client_id).filter((id): id is number => id != null)
      ).size;
      const totalClients = clients.length || 1;
      set({
        clientSegments: [
          {
            label: 'Verified',
            count: verified,
            percentage: Math.round((verified / totalClients) * 100),
            color: '#22c55e',
          },
          {
            label: 'Unverified',
            count: unverified,
            percentage: Math.round((unverified / totalClients) * 100),
            color: '#f59e0b',
          },
          {
            label: 'With active book',
            count: withLoans,
            percentage: Math.round((withLoans / totalClients) * 100),
            color: '#0a3d7a',
          },
        ],
      });
    } catch (e) {
      set({
        lastError: e instanceof Error ? e.message : 'Failed to refresh reports',
      });
    } finally {
      set({ loading: false });
    }
  },
}));
