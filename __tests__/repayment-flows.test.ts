import { config } from '@/lib/config';
import {
  dedicatedStaffRepaymentFlow,
  liveTrackingCount,
  metricsToKpis,
  overviewToKpis,
  repaymentAmountMinor,
  repaymentStatusLabel,
  staffRepaymentHubCopy,
  sumOverviewDueMinor,
} from '@/lib/staff/repayment-flows';
import type { ApiRepaymentOverviewItem } from '@/lib/data/api';

const dueItem = (amount: number, live = false): ApiRepaymentOverviewItem => ({
  id: amount,
  loan_account_number: `LN-${amount}`,
  client_id: 1,
  outstanding_principal: amount * 2,
  next_due_amount: amount,
  repayment_tracking_live: live,
});

describe('mobile repayment flows', () => {
  it('exposes accountant, PM, and executive repayment APIs', () => {
    expect(config.staff.accountantPendingRepayments).toContain('/accountant/repayments/pending');
    expect(config.staff.accountantFinalizeRepayments).toContain('/accountant/repayments/finalize');
    expect(config.staff.accountantFinalizeAllRepayments).toContain(
      '/accountant/repayments/finalize-all'
    );
    expect(config.staff.portfolioManagerRepaymentsList).toContain(
      '/portfolio-manager/repayments/list'
    );
    expect(config.staff.portfolioManagerRepaymentsMetrics).toContain(
      '/portfolio-manager/repayments/metrics'
    );
    expect(config.staff.ceoExecutiveMetrics).toContain('/ceo/repayments/executive-metrics');
    expect(config.staff.gceoStrategicMetrics).toContain('/gceo/repayments/strategic-metrics');
  });

  it('routes each role to a dedicated repayment desk', () => {
    expect(dedicatedStaffRepaymentFlow('ACCOUNTANT')?.href).toBe('/(staff)/accountant/repayments');
    expect(dedicatedStaffRepaymentFlow('CIO')?.href).toBe('/(staff)/cio/repayments');
    expect(dedicatedStaffRepaymentFlow('PORTFOLIO_MANAGER')?.href).toBe(
      '/(staff)/portfolio-manager/repayments'
    );
    expect(dedicatedStaffRepaymentFlow('OPERATIONS_ASSISTANT')?.href).toBe(
      '/(staff)/operations-assistant/repayments'
    );
    expect(dedicatedStaffRepaymentFlow('OPERATIONS_ASSISTANT')?.title).toBe(
      'Current and legacy repayments'
    );
    expect(config.repayments.legacyBook).toContain('/repayments/legacy-book');
    expect(dedicatedStaffRepaymentFlow('OPERATIONS_OFFICER')?.href).toBe(
      '/(staff)/operations/repayments'
    );
    expect(dedicatedStaffRepaymentFlow('OPERATIONS_OFFICER')?.title).toBe(
      'Current and legacy repayments'
    );
    expect(dedicatedStaffRepaymentFlow('OPERATIONS_MANAGER')?.href).toBe(
      '/(staff)/operations/repayments'
    );
    expect(dedicatedStaffRepaymentFlow('ACCOUNTANT')?.title).toBe('Accountant repayments');
    expect(dedicatedStaffRepaymentFlow('CEO')?.href).toBe('/(staff)/ceo/repayments');
    expect(dedicatedStaffRepaymentFlow('GCEO')?.href).toBe('/(staff)/gceo/repayments');
    expect(dedicatedStaffRepaymentFlow('LOAN_OFFICER')).toBeNull();
  });

  it('uses role-aware hub copy', () => {
    expect(staffRepaymentHubCopy('ACCOUNTANT').subtitle).toContain('GL');
    expect(staffRepaymentHubCopy('CIO').subtitle).toContain('Supervised');
    expect(staffRepaymentHubCopy('PORTFOLIO_MANAGER').subtitle).toContain('Portfolio');
    expect(staffRepaymentHubCopy('LOAN_OFFICER').subtitle).toContain('Field collections');
  });

  it('sums due amounts and live tracks for KPI cards', () => {
    const due = [dueItem(10_000, true), dueItem(5_000)];
    expect(sumOverviewDueMinor(due)).toBe(15_000);
    expect(liveTrackingCount(due)).toBe(1);
    const kpis = overviewToKpis({ due, overdue: [dueItem(2_000)], upcoming: [] });
    expect(kpis[0]?.label).toBe('Due today');
    expect(kpis[1]?.tone).toBe('warning');
    expect(repaymentStatusLabel('AWAITING_VERIFICATION')).toBe('AWAITING VERIFICATION');
    expect(repaymentAmountMinor({ total_amount: 12_500 })).toBe(12_500);
    expect(repaymentAmountMinor({ amount_minor: 9_000, total_amount: 12_500 })).toBe(9_000);
  });

  it('maps executive metrics into KPI cards', () => {
    const kpis = metricsToKpis({
      total_repayments: 12,
      total_amount_minor: 250_000,
      collection_rate: 87.4,
      overdue_repayment_count: 3,
    });
    expect(kpis.map((item) => item.label)).toEqual([
      'Receipts',
      'Collected',
      'Collection rate',
      'Overdue',
    ]);
    expect(kpis[2]?.value).toBe('87%');
    expect(kpis[3]?.tone).toBe('warning');
  });
});
