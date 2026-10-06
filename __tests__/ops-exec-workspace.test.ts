import { config } from '@/lib/config';
import {
  isCeoStaffRole,
  isGceoStaffRole,
  isOperationsAssistantStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
} from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import {
  applicationMatchesCeoQueue,
  applicationMatchesCioReviewQueue,
  applicationMatchesGceoQueue,
  applicationMatchesOpsHandoffQueue,
  applicationMatchesOpsOfficerQueue,
  applicationMatchesPmQueue,
  applicationMatchesReturnedQueue,
  applicationsListCopy,
  normalizeStaffAppQueue,
  staffApplicationWorkspaceHref,
} from '@/lib/staff/role-queues';

describe('operations and executive mobile workspaces', () => {
  it('opens the existing application workspace from every queue', () => {
    expect(staffApplicationWorkspaceHref(88)).toBe('/(staff)/applications/88');
  });

  it('recognizes isolated ops and executive queue chips', () => {
    expect(normalizeStaffAppQueue('ops')).toBe('ops');
    expect(normalizeStaffAppQueue('handoff')).toBe('handoff');
    expect(normalizeStaffAppQueue('ceo')).toBe('ceo');
    expect(normalizeStaffAppQueue('gceo')).toBe('gceo');
    expect(normalizeStaffAppQueue('returned')).toBe('returned');
    expect(normalizeStaffAppQueue('bogus')).toBe('all');
  });

  it('matches files sent back to the loan officer lane', () => {
    expect(applicationMatchesReturnedQueue({ origination_stage: 'RETURNED_TO_LO' })).toBe(true);
    expect(
      applicationMatchesReturnedQueue({
        status: 'PENDING_REVIEW',
        origination_stage: 'RETURNED_TO_LO',
      })
    ).toBe(true);
    expect(
      applicationMatchesReturnedQueue({
        status: 'SUBMITTED',
        origination_return_reason: 'Fix the collateral docs',
      })
    ).toBe(true);
    expect(
      applicationMatchesReturnedQueue({
        status: 'SUBMITTED',
        origination_return_reason: '',
      })
    ).toBe(false);
    expect(applicationMatchesReturnedQueue({ status: 'REJECTED' })).toBe(false);
    expect(applicationMatchesReturnedQueue({ status: 'WITHDRAWN', origination_stage: 'RETURNED_TO_LO' })).toBe(
      false
    );
    expect(applicationMatchesReturnedQueue({ status: 'DISBURSED', origination_stage: 'RETURNED_TO_LO' })).toBe(
      false
    );
    expect(applicationMatchesReturnedQueue({ origination_stage: 'SUBMITTED_TO_CEO' })).toBe(false);
  });

  it('matches post-disburse and executive stages', () => {
    expect(
      applicationMatchesOpsOfficerQueue({
        status: 'DISBURSED',
        origination_stage: 'DISBURSED_OPS_QUEUE',
      })
    ).toBe(true);
    expect(applicationMatchesOpsHandoffQueue({ origination_stage: 'OPS_PENDING_MANAGER' })).toBe(true);
    expect(applicationMatchesCeoQueue({ origination_stage: 'SUBMITTED_TO_CEO' })).toBe(true);
    expect(applicationMatchesCeoQueue({ origination_stage: 'SUBMITTED_TO_GCEO' })).toBe(false);
    expect(applicationMatchesGceoQueue({ origination_stage: 'SUBMITTED_TO_GCEO' })).toBe(true);
    expect(applicationMatchesGceoQueue({ origination_stage: 'SUBMITTED_TO_CEO' })).toBe(false);
    expect(applicationMatchesPmQueue({ status: 'UNDER_REVIEW', origination_stage: 'CIO_VERIFIED_TO_PM' })).toBe(
      true
    );
    expect(applicationMatchesCioReviewQueue({ status: 'PENDING_REVIEW', origination_stage: 'SUBMITTED_TO_CIO' })).toBe(
      true
    );
    expect(
      applicationMatchesCioReviewQueue({ status: 'UNDER_REVIEW', origination_stage: 'CIO_VERIFIED_TO_PM' })
    ).toBe(false);
    expect(applicationMatchesOpsOfficerQueue({ status: 'DRAFT', origination_stage: 'DRAFT' })).toBe(false);
  });

  it('uses role-aligned list titles', () => {
    expect(applicationsListCopy('OPERATIONS_OFFICER').title).toBe('Operations handoff');
    expect(applicationsListCopy('OPERATIONS_MANAGER').title).toBe('Operations manager queues');
    expect(applicationsListCopy('CEO').title).toBe('CEO action queue');
    expect(applicationsListCopy('GCEO').title).toBe('GCEO action queue');
  });

  it('does not treat CEO as GCEO or manager as officer', () => {
    expect(isCeoStaffRole('CEO')).toBe(true);
    expect(isGceoStaffRole('CEO')).toBe(false);
    expect(isOperationsOfficerStaffRole('OPERATIONS_MANAGER')).toBe(false);
    expect(isOperationsManagerStaffRole('OPERATIONS_ASSISTANT')).toBe(false);
    expect(isOperationsAssistantStaffRole('OPS_ASSISTANT')).toBe(true);
    expect(backendRoleMatches('OPERATIONS_OFFICER', ['OPERATIONS_OFFICER'])).toBe(true);
    expect(backendRoleMatches('OPERATIONS_OFFICER', ['OPERATIONS_MANAGER'])).toBe(false);
    expect(backendRoleMatches('GCEO', ['GCEO'])).toBe(true);
    expect(backendRoleMatches('CEO', ['GCEO'])).toBe(false);
  });

  it('exposes operations and executive API paths', () => {
    expect(config.staff.operationsOfficerOpsQueue).toContain('/operations-officer/origination/ops-queue');
    expect(config.staff.operationsOfficerEscalateRepayment(12)).toContain(
      '/operations-officer/repayments/12/escalate'
    );
    expect(config.staff.operationsManagerHandoffQueue).toContain(
      '/operations-manager/applications/repayment-handoff-queue'
    );
    expect(config.staff.operationsManagerApproveEscalation(9)).toContain(
      '/operations-manager/repayments/9/approve-escalation'
    );
    expect(config.staff.operationsAssistantPendingReview).toContain(
      '/operations-assistant/disbursements/pending-review'
    );
    expect(config.staff.ceoQueue).toContain('/ceo/applications/ceo-queue');
    expect(config.staff.gceoQueue).toContain('/gceo/applications/gceo-queue');
    expect(config.staff.pendingDisbursementRelease).toContain('/loans/disbursements/pending-release');
    expect(config.staff.approveDisbursementRelease(3)).toContain(
      '/loans/disbursements/3/release-approve'
    );
    expect(config.investment.funds).toContain('/investment/funds/');
    expect(config.investment.allocationSummary).toContain('/investment/allocations/summary');
  });
});
