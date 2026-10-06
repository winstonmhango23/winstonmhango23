import { loanNeedsCeoFundMapping } from '@/lib/accountant-funded-book';
import { config } from '@/lib/config';
import {
  canAssignLoanInvestment,
  canViewLoanInvestmentAssignment,
  isInvestmentAssigned,
} from '@/lib/investment-assignment';

describe('investment assignment role gates', () => {
  it('lets portfolio manager, accountant, and operations roles assign', () => {
    expect(canAssignLoanInvestment('portfolio_manager')).toBe(true);
    expect(canAssignLoanInvestment('PORTFOLIO_MANAGER')).toBe(true);
    expect(canAssignLoanInvestment('accountant')).toBe(true);
    expect(canAssignLoanInvestment('operations_officer')).toBe(true);
    expect(canAssignLoanInvestment('operations_assistant')).toBe(true);
    expect(canAssignLoanInvestment('ops_manager')).toBe(true);
    expect(canAssignLoanInvestment('admin')).toBe(true);
  });

  it('hides assignment from CIO, loan officer, and clients', () => {
    expect(canAssignLoanInvestment('credit_investment_officer')).toBe(false);
    expect(canAssignLoanInvestment('cio')).toBe(false);
    expect(canAssignLoanInvestment('loan_officer')).toBe(false);
    expect(canAssignLoanInvestment('customer')).toBe(false);
    expect(canViewLoanInvestmentAssignment('credit_investment_officer')).toBe(false);
    expect(canViewLoanInvestmentAssignment('loan_officer')).toBe(false);
    expect(canViewLoanInvestmentAssignment('client')).toBe(false);
    expect(canViewLoanInvestmentAssignment('portfolio_manager')).toBe(true);
    expect(canViewLoanInvestmentAssignment('branch_manager')).toBe(true);
    expect(canViewLoanInvestmentAssignment('ceo')).toBe(true);
  });
});

describe('isInvestmentAssigned', () => {
  it('resolves the explicit flag or a mapped pool', () => {
    expect(isInvestmentAssigned({})).toBe(false);
    expect(isInvestmentAssigned({ investment_assigned: false })).toBe(false);
    expect(isInvestmentAssigned({ investment_assigned: true })).toBe(true);
    expect(isInvestmentAssigned({ allocationId: 9 })).toBe(true);
    expect(isInvestmentAssigned({ fundingFundName: 'CEO Growth Fund' })).toBe(true);
  });
});

describe('loanNeedsCeoFundMapping', () => {
  it('treats the investment_assigned flag as mapped', () => {
    expect(loanNeedsCeoFundMapping({ investment_assigned: true })).toBe(false);
    expect(loanNeedsCeoFundMapping({ investmentAssigned: true })).toBe(false);
    expect(loanNeedsCeoFundMapping({ investment_assigned: false })).toBe(true);
  });
});

describe('shared loan investment API paths', () => {
  it('exposes FastAPI pool list and assign routes', () => {
    expect(config.loans.investmentPools).toContain('/loans/investment-pools');
    expect(config.loans.assignInvestmentPool(12)).toContain('/loans/12/assign-investment-pool');
  });
});
