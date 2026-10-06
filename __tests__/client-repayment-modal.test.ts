import { config } from '@/lib/config';
import { buildInstallmentAllocationPlan } from '@/lib/loan-origination/installment-allocation';
import {
  installmentRemaining,
  isInstallmentOpen,
} from '@/lib/staff-repayment-schedule';

describe('client repayment wiring', () => {
  it('uses borrower Airtel/TNM and default mobile Custom repayment', () => {
    expect(config.airtel.repay).toContain('/customer/airtel/repay');
    expect(config.mpamba.repay).toContain('/customer/tnm/repay');
    expect(config.mobile.repayments).toContain('/mobile/repayments');
    expect(config.customer.installmentSelection(7)).toContain(
      '/customer/loans/7/installment-selection'
    );
  });

  it('supports schedule prefill helpers for open installments', () => {
    const open = {
      id: 11,
      installment_number: 3,
      due_date: '2026-09-01',
      principal_amount: 50000,
      interest_amount: 5000,
      total_amount: 55000,
      paid_amount: 0,
      status: 'DUE',
    };
    expect(isInstallmentOpen(open)).toBe(true);
    expect(installmentRemaining(open)).toBe(55000);
  });

  it('builds multi-installment allocation plans for deposit submit', () => {
    const plan = buildInstallmentAllocationPlan(
      [
        {
          id: 11,
          remaining_principal: 40000,
          remaining_interest: 5000,
          penalty_amount: 1000,
          remaining_amount: 46000,
        },
        {
          id: 12,
          remaining_principal: 40000,
          remaining_interest: 4000,
          penalty_amount: 0,
          remaining_amount: 44000,
        },
      ],
      [11, 12]
    );
    expect(plan.total).toBe(90000);
    expect(plan.principal).toBe(80000);
  });
});
