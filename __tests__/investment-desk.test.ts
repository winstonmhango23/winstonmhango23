import { config } from '@/lib/config';
import {
  allocationToActionItem,
  canAccessInvestmentDesk,
  formatInvestmentLabel,
  fundToActionItem,
  investmentOverviewKpis,
  isPendingSubscription,
  shareholderToActionItem,
  subscriptionToActionItem,
  unwrapInvestmentList,
} from '@/lib/staff/investment-desk';

describe('CEO / GCEO investment desk', () => {
  it('exposes FastAPI investment paths', () => {
    expect(config.investment.funds).toContain('/investment/funds/');
    expect(config.investment.fundStats).toContain('/investment/funds/statistics/summary');
    expect(config.investment.shareholders).toContain('/investment/shareholders/');
    expect(config.investment.shareholderStats).toContain(
      '/investment/shareholders/statistics/summary'
    );
    expect(config.investment.investments).toContain('/investment/investments/');
    expect(config.investment.investmentApprove(9)).toContain('/investment/investments/9/approve');
    expect(config.investment.investmentReject(9)).toContain('/investment/investments/9/reject');
    expect(config.investment.investmentStats).toContain(
      '/investment/investments/statistics/summary'
    );
    expect(config.investment.allocations).toContain('/investment/allocations/');
    expect(config.investment.allocationSummary).toContain('/investment/allocations/summary');
  });

  it('gates the desk to CEO, GCEO, and admin', () => {
    expect(canAccessInvestmentDesk('CEO')).toBe(true);
    expect(canAccessInvestmentDesk('GCEO')).toBe(true);
    expect(canAccessInvestmentDesk('ADMIN')).toBe(true);
    expect(canAccessInvestmentDesk('ACCOUNTANT')).toBe(false);
    expect(canAccessInvestmentDesk('LOAN_OFFICER')).toBe(false);
    expect(canAccessInvestmentDesk('PORTFOLIO_MANAGER')).toBe(false);
  });

  it('unwraps named list envelopes and maps rows', () => {
    expect(unwrapInvestmentList([{ id: 1 }], 'funds')).toEqual([{ id: 1 }]);
    expect(unwrapInvestmentList({ funds: [{ id: 2 }] }, 'funds')).toEqual([{ id: 2 }]);
    expect(unwrapInvestmentList(null, 'funds')).toEqual([]);
    expect(formatInvestmentLabel('EQUITY_FUND')).toBe('EQUITY FUND');
    expect(isPendingSubscription('pending')).toBe(true);
    expect(isPendingSubscription('APPROVED')).toBe(false);

    const fund = fundToActionItem({
      id: 3,
      fund_name: 'CoFi Growth',
      fund_code: 'CGF-I',
      fund_type: 'EQUITY_FUND',
      status: 'ACTIVE',
      total_committed_cents: 2_500_00,
      deployment_rate: 40.2,
    });
    expect(fund.title).toBe('CoFi Growth');
    expect(fund.subtitle).toContain('CGF-I');
    expect(fund.amountMinor).toBe(2_500_00);
    expect(fund.meta).toBe('Deployment 40%');

    const holder = shareholderToActionItem({
      id: 4,
      name: 'ABC Pension',
      shareholder_type: 'INSTITUTIONAL',
      num_investments: 2,
      total_commitment_cents: 1_000_00,
    });
    expect(holder.subtitle).toContain('INSTITUTIONAL');
    expect(holder.meta).toBe('2 investments');

    const sub = subscriptionToActionItem({
      id: 5,
      shareholder_name: 'ABC Pension',
      fund_name: 'CoFi Growth',
      investment_type: 'EQUITY',
      approval_status: 'PENDING',
      commitment_amount_cents: 750_00,
    });
    expect(sub.meta).toBe('PENDING');
    expect(sub.amountMinor).toBe(750_00);

    const allocation = allocationToActionItem({
      id: 6,
      fund_name: 'CoFi Growth',
      scope: 'GLOBAL',
      service_type: 'loan_management',
      allocated_amount_minor: 500_00,
      is_active: true,
    });
    expect(allocation.subtitle).toContain('loan management');
    expect(allocation.meta).toBe('Active');
  });

  it('builds overview KPIs from summary payloads', () => {
    const kpis = investmentOverviewKpis({
      funds: { total_funds: 3, total_aum_cents: 1_000_00 },
      shareholders: { total_shareholders: 8 },
      subscriptions: { total_investments: 11 },
      allocations: { total_allocated_minor: 400_00, total_unallocated_minor: 200_00 },
    });
    expect(kpis.map((row) => row.label)).toEqual([
      'Funds',
      'AUM',
      'Shareholders',
      'Subscriptions',
      'Allocated',
      'Unallocated',
    ]);
    expect(kpis[0]?.value).toBe('3');
    expect(kpis[2]?.value).toBe('8');
    expect(kpis[3]?.value).toBe('11');
  });
});
