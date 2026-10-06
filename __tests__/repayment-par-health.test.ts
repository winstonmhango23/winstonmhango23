import {
  formatParPct,
  parBuckets,
  parConcentrationBands,
  parseRepaymentParHealth,
  parSeverity,
} from '@/lib/staff/repayment-par-health';
import { loPar30Pct, loParHealth } from '@/lib/staff/loan-officer-dashboard';
import type { ApiLoanOfficerDashboard } from '@/lib/data/api';

const sampleHealth = {
  live_book_outstanding_minor: 10_000_000,
  live_active_loan_count: 20,
  loans_awaiting_repayment_tracking_count: 1,
  par_30_outstanding_minor: 1_200_000,
  par_60_outstanding_minor: 800_000,
  par_90_outstanding_minor: 400_000,
  par_30_loan_count: 3,
  par_60_loan_count: 2,
  par_90_loan_count: 1,
  par_30_pct_of_live_book: 12,
  par_60_pct_of_live_book: 8,
  par_90_pct_of_live_book: 4,
  scheduled_penalties_outstanding_minor: 50_000,
};

describe('repayment PAR health helpers', () => {
  it('parses engine snapshot fields', () => {
    const snap = parseRepaymentParHealth(sampleHealth);
    expect(snap?.par_30_pct_of_live_book).toBe(12);
    expect(snap?.par_60_loan_count).toBe(2);
    expect(snap?.live_book_outstanding_minor).toBe(10_000_000);
  });

  it('applies dashboard severity bands', () => {
    expect(parSeverity(0)).toBe('healthy');
    expect(parSeverity(3)).toBe('watch');
    expect(parSeverity(7)).toBe('warn');
    expect(parSeverity(12)).toBe('critical');
    expect(formatParPct(4.25)).toBe('4.3%');
  });

  it('builds PAR30/60/90 buckets and concentration bands', () => {
    const snap = parseRepaymentParHealth(sampleHealth)!;
    const buckets = parBuckets(snap);
    expect(buckets.map((b) => b.label)).toEqual(['PAR 30+', 'PAR 60+', 'PAR 90+']);
    expect(buckets[0].severity).toBe('critical');

    const bands = parConcentrationBands(snap);
    expect(bands.find((b) => b.label.startsWith('Performing'))?.amountMinor).toBe(8_800_000);
    expect(bands.find((b) => b.label === '30–59 days')?.amountMinor).toBe(400_000);
    expect(bands.find((b) => b.label === '90+ days')?.amountMinor).toBe(400_000);
  });
});

describe('loan officer dashboard PAR helpers', () => {
  const sample: ApiLoanOfficerDashboard = {
    total_active_loans: 12,
    total_pending_applications: 3,
    total_arrears_loans: 2,
    portfolio_value: 1_000_000,
    upcoming_repayments_count: 4,
    active_clients: 20,
    active_groups: 2,
    pending_approval_repayments: 1,
    awaiting_verification_repayments: 5,
    overdue_repayments: 7,
    serviced_today_repayments: 2,
    pending_collateral_reviews: 1,
    locked_collateral_total: 50000,
    collateral_insufficiency_alerts: 0,
    pending_loan_approvals: 0,
    pending_disbursements: 1,
    pending_group_reviews: 0,
    pending_repayment_verifications: 0,
    recent_registrations: 0,
    recent_deposits: 0,
    recent_transfers: 0,
    unread_notifications: 0,
    high_priority_notifications: 0,
    pending_group_repayments: 0,
    group_arrears_loans: 0,
    repayment_par_health: sampleHealth,
  };

  it('exposes full PAR health and PAR30 for hero widgets', () => {
    expect(loPar30Pct(sample)).toBe(12);
    expect(loParHealth(sample)?.par_90_pct_of_live_book).toBe(4);
    expect(loParHealth(null)).toBeNull();
  });
});
