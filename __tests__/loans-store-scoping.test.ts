import { isLoanOfficerStaffRole } from '@/lib/loan-origination/origination-workflow';

describe('loan officer portfolio scoping', () => {
  it('treats LOAN_OFFICER and OFFICER as portfolio-scoped staff', () => {
    expect(isLoanOfficerStaffRole('LOAN_OFFICER')).toBe(true);
    expect(isLoanOfficerStaffRole('OFFICER')).toBe(true);
    expect(isLoanOfficerStaffRole('loan_officer')).toBe(true);
  });

  it('does not treat managers or executives as loan officers', () => {
    expect(isLoanOfficerStaffRole('OPS_MANAGER')).toBe(false);
    expect(isLoanOfficerStaffRole('CEO')).toBe(false);
    expect(isLoanOfficerStaffRole('PORTFOLIO_MANAGER')).toBe(false);
  });
});
