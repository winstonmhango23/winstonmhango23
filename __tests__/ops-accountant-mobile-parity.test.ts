import { ceoFundDisplayName, loanNeedsCeoFundMapping } from '@/lib/accountant-funded-book';
import {
  labelOpsEnum,
  opsQueueDetailHref,
  opsRepaymentRecordHref,
  opsRepaymentRoleFromBackend,
} from '@/lib/ops-records';
import { canCollectRepayments, repaymentProcessorVariantForRole } from '@/lib/repayment-role-workspace';

describe('ops / accountant mobile parity helpers', () => {
  it('maps backend roles onto repayment record workspaces', () => {
    expect(opsRepaymentRoleFromBackend('OPERATIONS_OFFICER')).toBe('officer');
    expect(opsRepaymentRoleFromBackend('OPERATIONS_ASSISTANT')).toBe('assistant');
    expect(opsRepaymentRoleFromBackend('OPERATIONS_MANAGER')).toBe('manager');
    expect(opsRepaymentRoleFromBackend('ACCOUNTANT')).toBe('officer');
    expect(opsRepaymentRoleFromBackend('LOAN_OFFICER')).toBeNull();
  });

  it('builds record and queued-loan hrefs', () => {
    expect(opsRepaymentRecordHref(12, 'officer')).toBe('/(staff)/operations/repayment/12');
    expect(opsRepaymentRecordHref(12, 'manager')).toBe('/(staff)/operations-manager/repayment/12');
    expect(opsQueueDetailHref(8)).toBe('/(staff)/operations/queue/8');
    expect(opsQueueDetailHref(8, true)).toBe('/(staff)/operations-manager/queue/8');
  });

  it('lets operations book repayments; hides collect CTAs for accountant and origination', () => {
    expect(canCollectRepayments('LOAN_OFFICER')).toBe(false);
    expect(canCollectRepayments('CREDIT_INVESTMENT_OFFICER')).toBe(false);
    expect(canCollectRepayments('SENIOR_CREDIT_INVESTMENT_OFFICER')).toBe(false);
    expect(canCollectRepayments('ACCOUNTANT')).toBe(false);
    expect(canCollectRepayments('OPERATIONS_OFFICER')).toBe(true);
    expect(canCollectRepayments('OPERATIONS_ASSISTANT')).toBe(true);
    expect(canCollectRepayments('OPERATIONS_MANAGER')).toBe(true);
    expect(canCollectRepayments('TELLER')).toBe(true);
    expect(canCollectRepayments('PORTFOLIO_MANAGER')).toBe(true);
    expect(repaymentProcessorVariantForRole('ACCOUNTANT')).toBe('oversight');
    expect(repaymentProcessorVariantForRole('LOAN_OFFICER')).toBe('oversight');
    expect(repaymentProcessorVariantForRole('CREDIT_INVESTMENT_OFFICER')).toBe('oversight');
    expect(repaymentProcessorVariantForRole('OPERATIONS_OFFICER')).toBe('collect');
    expect(repaymentProcessorVariantForRole('OPERATIONS_ASSISTANT')).toBe('collect');
    expect(repaymentProcessorVariantForRole('OPERATIONS_MANAGER')).toBe('collect');
  });

  it('flags loans that still need CEO fund mapping', () => {
    expect(loanNeedsCeoFundMapping({})).toBe(true);
    expect(loanNeedsCeoFundMapping({ allocation_id: 3 })).toBe(false);
    expect(loanNeedsCeoFundMapping({ funding_fund_name: 'CEO Growth' })).toBe(false);
    expect(loanNeedsCeoFundMapping({ investment_assigned: true })).toBe(false);
    expect(ceoFundDisplayName({ funding_fund_name: 'CEO Growth' })).toBe('CEO Growth');
    expect(labelOpsEnum('PENDING_OPERATIONS_VERIFICATION')).toBe('PENDING OPERATIONS VERIFICATION');
  });
});
