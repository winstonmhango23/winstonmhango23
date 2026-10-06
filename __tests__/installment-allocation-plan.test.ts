import { config } from '@/lib/config';
import { buildInstallmentAllocationPlan } from '@/lib/loan-origination/installment-allocation';

describe('buildInstallmentAllocationPlan', () => {
  const rows = [
    {
      id: 1,
      remaining_principal: 10000,
      remaining_interest: 2000,
      penalty_amount: 500,
      remaining_amount: 12500,
    },
    {
      id: 2,
      remaining_principal: 10000,
      remaining_interest: 1500,
      penalty_amount: 0,
      remaining_amount: 11500,
    },
    {
      id: 3,
      remaining_principal: 10000,
      remaining_interest: 1000,
      penalty_amount: 0,
      remaining_amount: 11000,
    },
  ];

  it('sums only selected installments', () => {
    expect(buildInstallmentAllocationPlan(rows, [1, 3])).toEqual({
      principal: 20000,
      interest: 3000,
      penalty: 500,
      total: 23500,
    });
  });

  it('returns zeros when nothing is selected', () => {
    expect(buildInstallmentAllocationPlan(rows, [])).toEqual({
      principal: 0,
      interest: 0,
      penalty: 0,
      total: 0,
    });
  });
});

describe('portal gap config paths', () => {
  it('exposes collateral summary, batch, and authenticated document streams', () => {
    expect(config.mobile.applicationCollateralSummary(9)).toContain(
      '/mobile/loan-applications/9/collateral/summary'
    );
    expect(config.mobile.applicationCollateralBatch(9)).toContain(
      '/mobile/loan-applications/9/collateral/batch'
    );
    expect(config.mobile.applicationDocuments(9)).toContain(
      '/mobile/loan-applications/9/documents'
    );
    expect(config.mobile.loanDocumentFile(12)).toContain('/mobile/loan-documents/12/file');
    expect(config.mobile.customerDocumentFile(4)).toContain('/mobile/customer/documents/4/file');
  });
});
