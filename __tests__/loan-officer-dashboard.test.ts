import {
  formatParPct,
  loDashboardQueueItems,
  loPar30Pct,
} from '@/lib/staff/loan-officer-dashboard';
import type { ApiLoanOfficerDashboard } from '@/lib/data/api';

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
  repayment_par_health: { par_30_pct_of_live_book: 4.25 },
};

describe('loan officer dashboard helpers', () => {
  it('surfaces priority queues with navigation targets', () => {
    const queues = loDashboardQueueItems(sample);
    expect(queues.find((q) => q.key === 'awaiting_verification')?.count).toBe(5);
    expect(queues.find((q) => q.key === 'overdue_repayments')?.href).toBe(
      '/(staff)/repayments?tab=overdue'
    );
    expect(queues.find((q) => q.key === 'awaiting_verification')?.href).toBe(
      '/(staff)/repayments?tab=awaiting'
    );
    expect(queues.find((q) => q.key === 'pending_apps')?.href).toBe(
      '/(staff)/applications?queue=pending'
    );
    expect(queues.find((q) => q.key === 'pending_collateral')?.href).toBe(
      '/(staff)/applications?queue=collateral'
    );
    expect(queues.find((q) => q.key === 'pending_disbursements')?.href).toBe(
      '/(staff)/loans?queue=pending_disbursement'
    );
    expect(queues.every((q) => q.href.startsWith('/(staff)/'))).toBe(true);
  });

  it('reads PAR 30 from repayment_par_health', () => {
    expect(loPar30Pct(sample)).toBe(4.25);
    expect(formatParPct(4.25)).toBe('4.3%');
    expect(loPar30Pct(null)).toBeNull();
    expect(formatParPct(null)).toBe('—');
  });
});
