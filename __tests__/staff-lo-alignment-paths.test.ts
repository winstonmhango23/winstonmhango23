import { config } from '@/lib/config';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';

describe('staff LO repayment path builders', () => {
  it('points reverse at /repayments/{id}/reverse', () => {
    expect(config.repayments.reverse(42)).toContain('/repayments/42/reverse');
    expect(config.repayments.reverse(42)).not.toContain('/loans/repayments/');
  });

  it('exposes hub + portfolio-history paths', () => {
    expect(config.repayments.dueToday).toContain('/repayments/due-today');
    expect(config.repayments.overdue).toContain('/repayments/overdue');
    expect(config.repayments.upcoming).toContain('/repayments/upcoming');
    expect(config.repayments.portfolioHistory).toContain('/repayments/portfolio-history');
  });

  it('exposes permissions/me and staff digest', () => {
    expect(config.permissions.me).toContain('/permissions/me');
    expect(config.staff.digest).toContain('/staff/digest');
  });
});

describe('role workspace gate', () => {
  it('allows matching CEO/GCEO and admin bypass', () => {
    expect(backendRoleMatches('CEO', ['CEO', 'GCEO'])).toBe(true);
    expect(backendRoleMatches('GCEO', ['CEO', 'GCEO'])).toBe(true);
    expect(backendRoleMatches('SUPER_ADMIN', ['CEO'])).toBe(true);
  });

  it('blocks loan officer from CEO shell', () => {
    expect(backendRoleMatches('LOAN_OFFICER', ['CEO', 'GCEO'])).toBe(false);
    expect(backendRoleMatches('LOAN_OFFICER', ['CIO'])).toBe(false);
    expect(backendRoleMatches('LOAN_OFFICER', ['ACCOUNTANT'])).toBe(false);
  });

  it('allows portfolio manager and accountant workspace families', () => {
    expect(backendRoleMatches('PORTFOLIO_MANAGER', ['PORTFOLIO_MANAGER'])).toBe(true);
    expect(backendRoleMatches('PM', ['PORTFOLIO_MANAGER'])).toBe(true);
    expect(backendRoleMatches('portfolio manager', ['PORTFOLIO_MANAGER'])).toBe(true);
    expect(backendRoleMatches('ACCOUNTANT', ['ACCOUNTANT'])).toBe(true);
    expect(backendRoleMatches('LOAN_OFFICER', ['PORTFOLIO_MANAGER'])).toBe(false);
    expect(backendRoleMatches('CIO', ['ACCOUNTANT'])).toBe(false);
  });

  it('exposes PM and accountant dashboard endpoints', () => {
    expect(config.staff.portfolioManagerDashboard).toContain('/portfolio-manager/dashboard');
    expect(config.staff.portfolioManagerPmQueue).toContain(
      '/portfolio-manager/applications/pm-queue'
    );
    expect(config.staff.accountantDashboard).toContain('/accountant/dashboard');
    expect(config.staff.accountantPendingDisbursement).toContain(
      '/accountant/applications/pending-disbursement'
    );
    expect(config.staff.accountantGenerateJournals(9)).toContain(
      '/accountant/loan-journals/9/generate'
    );
    expect(config.staff.accountantReturnLoanForCorrection(9)).toContain(
      '/accountant/loan-journals/9/return-for-correction'
    );
    expect(config.staff.portfolioManagerLoanDrawdowns(3)).toContain(
      '/portfolio-manager/applications/3/loan-drawdowns'
    );
    expect(config.staff.zoneAssignLoanOfficer(8)).toContain(
      '/zones/8/hierarchy/assign-loan-officer'
    );
    expect(config.staff.zoneAvailableLoanOfficers(8, true)).toContain(
      'include_transfer_candidates=true'
    );
  });

  it('exposes operations and executive workspace endpoints', () => {
    expect(config.staff.operationsOfficerDashboard).toContain('/operations-officer/dashboard');
    expect(config.staff.operationsOfficerRepaymentRecord(9)).toContain(
      '/operations-officer/repayments/9'
    );
    expect(config.staff.operationsOfficerQueueDetail(4)).toContain(
      '/operations-officer/origination/4/queue-detail'
    );
    expect(config.staff.operationsOfficerConfirmBatch).toContain(
      '/operations-officer/repayments/confirm-batch'
    );
    expect(config.staff.operationsManagerRepaymentRecord(9)).toContain(
      '/operations-manager/repayments/9'
    );
    expect(config.staff.operationsManagerQueueDetail(4)).toContain(
      '/operations-manager/applications/4/queue-detail'
    );
    expect(config.staff.operationsManagerApproveRepayment(9)).toContain(
      '/operations-manager/repayments/9/approve'
    );
    expect(config.staff.accountantFundingPools).toContain('/accountant/funding-pools');
    expect(config.staff.accountantAttachLoanFundingPool(7)).toContain(
      '/accountant/loans/7/attach-funding-pool'
    );
    expect(config.staff.operationsManagerDashboard).toContain('/operations-manager/dashboard');
    expect(config.staff.operationsAssistantPendingReview).toContain(
      '/operations-assistant/disbursements/pending-review'
    );
    expect(config.staff.ceoDashboard).toContain('/ceo/dashboard');
    expect(config.staff.gceoDashboard).toContain('/gceo/dashboard');
  });
});
