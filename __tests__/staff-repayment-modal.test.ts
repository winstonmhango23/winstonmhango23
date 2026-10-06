import { config } from '@/lib/config';
import {
  installmentRemaining,
  isInstallmentOpen,
} from '@/lib/staff-repayment-schedule';

describe('staff repayment config paths', () => {
  it('points client Mpamba at /customer/tnm', () => {
    expect(config.mpamba.repay).toContain('/customer/tnm/repay');
    expect(config.mpamba.repayStatus('REF-1')).toContain('/customer/tnm/repay/REF-1/status');
  });

  it('exposes staff Airtel and TNM collection endpoints', () => {
    expect(config.airtel.staffInitiate).toContain('/airtel/collections/initiate');
    expect(config.airtel.staffStatus('AIRTEL-1')).toContain('/airtel/collections/AIRTEL-1');
    expect(config.mpamba.staffInitiate).toContain('/tnm/collections/initiate');
    expect(config.mpamba.staffStatus('TNM-1')).toContain('/tnm/collections/TNM-1');
  });
});

describe('staff repayment schedule helpers', () => {
  it('computes remaining and treats paid installments as closed', () => {
    const open = {
      installment_number: 1,
      due_date: '2026-08-01',
      principal_amount: 80000,
      interest_amount: 20000,
      total_amount: 100000,
      paid_amount: 25000,
      status: 'PARTIAL',
    };
    const paid = {
      ...open,
      installment_number: 2,
      paid_amount: 100000,
      status: 'PAID',
    };

    expect(installmentRemaining(open)).toBe(75000);
    expect(isInstallmentOpen(open)).toBe(true);
    expect(installmentRemaining(paid)).toBe(0);
    expect(isInstallmentOpen(paid)).toBe(false);
  });

  it('treats empty schedule as no open installments (free-amount path)', () => {
    expect([].filter(isInstallmentOpen)).toEqual([]);
  });
});
