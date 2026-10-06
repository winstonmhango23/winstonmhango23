import {
  applicationMatchesAccountantQueue,
  applicationMatchesPmQueue,
  applicationsListCopy,
  normalizeStaffAppQueue,
  staffApplicationWorkspaceHref,
  staffDrawdownEditorHref,
} from '@/lib/staff/role-queues';

describe('PM and accountant mobile queues', () => {
  it('opens the existing application workspace for both roles', () => {
    expect(staffApplicationWorkspaceHref(42)).toBe('/(staff)/applications/42');
    expect(staffDrawdownEditorHref(42)).toBe('/(staff)/portfolio-manager/drawdowns/42');
  });

  it('recognizes PM and ready-to-fund queue filters', () => {
    expect(normalizeStaffAppQueue('pm')).toBe('pm');
    expect(normalizeStaffAppQueue('ready')).toBe('ready');
    expect(normalizeStaffAppQueue('unknown')).toBe('all');
  });

  it('matches CIO-verified files for the PM queue', () => {
    expect(applicationMatchesPmQueue({ status: 'PENDING_REVIEW', origination_stage: 'CIO_VERIFIED_TO_PM' })).toBe(
      true
    );
    expect(applicationMatchesPmQueue({ status: 'DRAFT', origination_stage: 'DRAFT' })).toBe(false);
  });

  it('matches executive-approved files for the accountant queue', () => {
    expect(
      applicationMatchesAccountantQueue({
        status: 'PENDING_DISBURSEMENT',
        origination_stage: 'PENDING_DISBURSEMENT',
      })
    ).toBe(true);
    expect(
      applicationMatchesAccountantQueue({ status: 'READY_FOR_ACCOUNTANT', origination_stage: null })
    ).toBe(true);
    expect(applicationMatchesAccountantQueue({ status: 'DRAFT', origination_stage: 'DRAFT' })).toBe(
      false
    );
  });

  it('uses dashboard-aligned list titles', () => {
    expect(applicationsListCopy('PORTFOLIO_MANAGER').title).toBe('Approvals');
    expect(applicationsListCopy('ACCOUNTANT').title).toBe('Ready to disburse');
    expect(applicationsListCopy('LOAN_OFFICER').title).toBe('Applications');
  });
});
