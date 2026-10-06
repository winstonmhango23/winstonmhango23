import {
  buildReturnToClientReason,
  buildReturnToClientReasonWithItems,
  isApplicationReturnedForRework,
  filterAccountantActions,
  filterCreditOfficerActions,
  filterLoanOfficerActions,
  filterPortfolioManagerActions,
  isAccountantStaffRole,
  isCeoStaffRole,
  isCreditOfficerStaffRole,
  isGceoStaffRole,
  isLoanOfficerStaffRole,
  isOperationsAssistantStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
  isPortfolioManagerStaffRole,
  inferCreditBookFromIdentity,
  inferCreditBookFromProduct,
  listingRowCreditBook,
  listingRowIsAgricultural,
  isSmeCreditBook,
  staffBookOfficerTitle,
  filterEscalationActions,
  originationActionLabel,
  loanOfficerCanSubmitToCio,
  productMatchesCreditBook,
  parseReturnReasonPayload,
  resolveStaffJobRole,
  submitBlockedReason,
} from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import type { OriginationStatus } from '@/lib/data/api';

describe('origination-workflow', () => {
  it('identifies loan officer roles', () => {
    expect(isLoanOfficerStaffRole('loan_officer')).toBe(true);
    expect(isLoanOfficerStaffRole('OFFICER')).toBe(true);
    expect(isLoanOfficerStaffRole('Loan Officer')).toBe(true);
    expect(isLoanOfficerStaffRole('LO')).toBe(true);
    expect(isLoanOfficerStaffRole('PORTFOLIO_MANAGER')).toBe(false);
    expect(isLoanOfficerStaffRole('staff')).toBe(false);
    expect(isPortfolioManagerStaffRole('PORTFOLIO_MANAGER')).toBe(true);
    expect(isPortfolioManagerStaffRole('pm')).toBe(true);
    expect(isPortfolioManagerStaffRole('Portfolio Manager')).toBe(true);
    expect(isPortfolioManagerStaffRole('ACCOUNTANT')).toBe(false);
    expect(isAccountantStaffRole('ACCOUNTANT')).toBe(true);
    expect(isAccountantStaffRole('branch accountant')).toBe(true);
    expect(isAccountantStaffRole('PORTFOLIO_MANAGER')).toBe(false);
    expect(isOperationsOfficerStaffRole('OPERATIONS_OFFICER')).toBe(true);
    expect(isOperationsOfficerStaffRole('ops officer')).toBe(true);
    expect(isOperationsOfficerStaffRole('OPERATIONS_MANAGER')).toBe(false);
    expect(isOperationsManagerStaffRole('OPERATIONS_MANAGER')).toBe(true);
    expect(isOperationsManagerStaffRole('ops_manager')).toBe(true);
    expect(isOperationsAssistantStaffRole('OPERATIONS_ASSISTANT')).toBe(true);
    expect(isOperationsAssistantStaffRole('OPS_ASSISTANT')).toBe(true);
    expect(isCeoStaffRole('CEO')).toBe(true);
    expect(isCeoStaffRole('chief executive officer')).toBe(true);
    expect(isCeoStaffRole('GCEO')).toBe(false);
    expect(isGceoStaffRole('GCEO')).toBe(true);
    expect(isGceoStaffRole('general chief executive')).toBe(true);
    expect(isGceoStaffRole('CEO')).toBe(false);
  });

  it('resolves job title from backendRole before portal role', () => {
    expect(resolveStaffJobRole({ backendRole: 'Loan Officer', role: 'staff' })).toBe('Loan Officer');
    expect(resolveStaffJobRole({ role: 'staff', role_name: 'loan_officer' })).toBe('loan_officer');
    expect(resolveStaffJobRole({ role: 'staff' })).toBeUndefined();
  });

  it('keeps submit-to-CIO visible for draft/submitted files still with the LO', () => {
    expect(loanOfficerCanSubmitToCio('DRAFT', 'DRAFT')).toBe(true);
    expect(loanOfficerCanSubmitToCio('SUBMITTED', 'PENDING_LO_ACTION')).toBe(true);
    expect(loanOfficerCanSubmitToCio('SUBMITTED', 'UNEXPECTED_STAGE')).toBe(true);
    expect(loanOfficerCanSubmitToCio('PENDING_REVIEW', 'SUBMITTED_TO_CIO')).toBe(false);
    expect(loanOfficerCanSubmitToCio('PENDING_REVIEW', 'SUBMITTED_TO_CIO', ['SUBMIT_TO_CIO'])).toBe(
      true
    );
    expect(loanOfficerCanSubmitToCio('DRAFT', 'SUBMITTED_TO_CIO')).toBe(false);
  });

  it('identifies CIO/SCIO credit books', () => {
    expect(isCreditOfficerStaffRole('CREDIT_INVESTMENT_OFFICER')).toBe(true);
    expect(isCreditOfficerStaffRole('SENIOR_CREDIT_INVESTMENT_OFFICER')).toBe(true);
    expect(isCreditOfficerStaffRole('CIO')).toBe(true);
    expect(isCreditOfficerStaffRole('SCIO')).toBe(true);
    expect(backendRoleMatches('SCIO', ['CIO'])).toBe(true);
    expect(backendRoleMatches('senior credit investment officer', ['CIO'])).toBe(true);
    expect(isSmeCreditBook('SME')).toBe(true);
    expect(isSmeCreditBook('AGRICULTURAL')).toBe(false);
    expect(staffBookOfficerTitle('cio', 'SME')).toBe('SME CIO');
    expect(staffBookOfficerTitle('cio', 'AGRICULTURAL')).toBe('Group CIO');
    expect(staffBookOfficerTitle('lo', 'SME')).toBe('SME Loan Officer');
    expect(staffBookOfficerTitle('lo', null)).toBe('Group Loan Officer');
    expect(productMatchesCreditBook({ code: 'WSME', name: 'Women SME' }, 'AGRICULTURAL')).toBe(false);
    expect(productMatchesCreditBook({ code: 'IAgSME', name: 'Agri SME' }, 'AGRICULTURAL')).toBe(false);
    expect(productMatchesCreditBook({ code: 'IAgSME', name: 'Agri SME' }, 'SME')).toBe(true);
    expect(productMatchesCreditBook({ code: 'GSMEIN', name: 'Group agri input' }, 'GROUP')).toBe(true);
    expect(productMatchesCreditBook({ code: 'WSME', name: 'Women SME' }, 'SME')).toBe(true);
    expect(
      productMatchesCreditBook(
        { code: 'CASH', name: 'Cash', harvest_alignment_config: { enabled: true } },
        'AGRICULTURAL'
      )
    ).toBe(true);
    expect(
      inferCreditBookFromProduct({
        code: 'LEG',
        name: 'Women SME',
        is_agricultural_product: true,
      })
    ).toBe('SME');
    expect(inferCreditBookFromIdentity('LN-SME-001', 'Amina Traders')).toBe('SME');
    expect(inferCreditBookFromIdentity('LN-IAgSME-009')).toBe('SME');
    expect(inferCreditBookFromIdentity('LN-GSMEIN-002')).toBe('GROUP');
    expect(listingRowCreditBook({ application_number: 'LN-SME-001', product_name: 'Women SME' })).toBe('SME');
    expect(listingRowCreditBook({ loan_account_number: 'LN-GSMEIN-22', is_group_facility: true })).toBe('GROUP');
    expect(listingRowIsAgricultural({ application_number: 'LN-IAgSME-009', product_name: 'Input' })).toBe(true);
  });

  it('classifies SB/SALARY/SALARYBACKED as SME (mirror upstream credit-book fix)', () => {
    expect(inferCreditBookFromProduct({ code: 'SB-001', name: 'Salary Backed SME' })).toBe('SME');
    expect(inferCreditBookFromProduct({ code: 'SALARY', name: 'Salary Loan' })).toBe('SME');
    expect(inferCreditBookFromIdentity('SB-002', 'Salary Backed Traders')).toBe('SME');
    expect(inferCreditBookFromIdentity('SALARYBACKED-100')).toBe('SME');
    expect(inferCreditBookFromIdentity('LN-generic-100')).toBeNull();
    expect(listingRowCreditBook({ loan_account_number: 'SB-007', product_name: 'Salary SME' })).toBe('SME');
    expect(isSmeCreditBook('SALARY')).toBe(true);
    expect(isSmeCreditBook('SB')).toBe(true);
  });

  it('group markers keep precedence over SB tokens (mirror upstream credit-book fix)', () => {
    expect(inferCreditBookFromIdentity('GROUP SB centre')).toBe('GROUP');
    expect(inferCreditBookFromIdentity('GP COOPERATIVE SB')).toBe('GROUP');
    expect(listingRowCreditBook({ loan_account_number: 'LN-GSMEIN-31', product_name: 'Salary SME' })).toBe('GROUP');
  });

  it('keeps GSME-prefixed group loan numbers off the SME book while IAgSME stays SME', () => {
    expect(inferCreditBookFromIdentity('LOAN-GSMECL-2021-10-25')).toBe('GROUP');
    expect(inferCreditBookFromIdentity('LOAN-GSMETIK 7/24-2025-05-25')).toBe('GROUP');
    expect(inferCreditBookFromIdentity('LOAN-GSME NUA45 INC 027/23')).toBe('GROUP');
    expect(inferCreditBookFromIdentity('LOAN-GSMECIN-001')).toBe('GROUP');
    expect(listingRowCreditBook({ loan_account_number: 'LOAN-GSMECL-2021-10-25' })).toBe('GROUP');
    expect(listingRowCreditBook({ loan_account_number: 'LOAN-GSMETIK 7/24-2025-05-25' })).toBe('GROUP');
    expect(inferCreditBookFromIdentity('LOAN-IAGSME-009')).toBe('SME');
    expect(inferCreditBookFromIdentity('LOAN-AGHYB-020')).toBe('SME');
  });

  it('exposes CIO review actions on mobile', () => {
    expect(
      filterCreditOfficerActions(['CIO_SUBMIT_TO_PM', 'CIO_VERIFY_TO_PM', 'CIO_RETURN_TO_LO', 'PM_APPROVE_TO_ACCOUNTANT'])
    ).toEqual(['CIO_SUBMIT_TO_PM', 'CIO_VERIFY_TO_PM', 'CIO_RETURN_TO_LO']);
  });

  it('filters to LO-only actions', () => {
    expect(
      filterLoanOfficerActions(['SUBMIT_TO_CIO', 'CIO_VERIFY_TO_PM', 'LO_RETURN_TO_CLIENT'])
    ).toEqual(['SUBMIT_TO_CIO', 'LO_RETURN_TO_CLIENT']);
  });

  it('keeps PM/CEO/ops actions for the shared mobile workspace', () => {
    expect(
      filterEscalationActions([
        'SUBMIT_TO_CIO',
        'PM_APPROVE_TO_ACCOUNTANT',
        'CEO_SUBMIT_TO_GCEO',
        'OPS_MANAGER_ACKNOWLEDGE',
      ])
    ).toEqual(['PM_APPROVE_TO_ACCOUNTANT', 'CEO_SUBMIT_TO_GCEO', 'OPS_MANAGER_ACKNOWLEDGE']);
    expect(originationActionLabel('PM_APPROVE_TO_ACCOUNTANT')).toBe('Approve to accountant');
    expect(originationActionLabel('DISBURSE_THEN_POST_DISBURSEMENT_OPS')).toBe(
      'Book and hand to operations'
    );
    expect(
      filterPortfolioManagerActions([
        'PM_APPROVE_TO_ACCOUNTANT',
        'PM_SUBMIT_TO_CEO',
        'CIO_VERIFY_TO_PM',
      ])
    ).toEqual(['PM_APPROVE_TO_ACCOUNTANT', 'PM_SUBMIT_TO_CEO']);
    expect(
      filterAccountantActions(['DISBURSE_THEN_POST_DISBURSEMENT_OPS', 'PM_APPROVE_TO_ACCOUNTANT'])
    ).toEqual(['DISBURSE_THEN_POST_DISBURSEMENT_OPS']);
    expect(staffBookOfficerTitle('pm')).toBe('Portfolio Manager');
    expect(staffBookOfficerTitle('accountant')).toBe('Accountant');
  });

  it('parses JSON return reason with blockers', () => {
    const parsed = parseReturnReasonPayload(
      JSON.stringify({ message: 'Fix docs', blockers: [{ id: 'b1', text: 'Upload ID', met: false }] })
    );
    expect(parsed.message).toBe('Fix docs');
    expect(parsed.blockers).toHaveLength(1);
    expect(parsed.blockers[0].text).toBe('Upload ID');
  });

  it('builds return-to-client payload', () => {
    const raw = buildReturnToClientReason('Please update', ['Upload payslip']);
    const parsed = parseReturnReasonPayload(raw);
    expect(parsed.message).toBe('Please update');
    expect(parsed.blockers[0].text).toBe('Upload payslip');
  });

  it('builds tagged return-to-client payload preserving met flags', () => {
    const raw = buildReturnToClientReasonWithItems('Please update', [
      { id: 'b1', text: 'Upload payslip', met: true },
      { id: 'b2', text: 'update address', met: false },
      { id: 'b3', text: '   ', met: false },
    ]);
    const parsed = parseReturnReasonPayload(raw);
    expect(parsed.message).toBe('Please update');
    expect(parsed.blockers).toHaveLength(2);
    expect(parsed.blockers[0]).toEqual({ id: 'b1', text: 'Upload payslip', met: true });
    expect(parsed.blockers[1]).toEqual({ id: 'b2', text: 'update address', met: false });
  });

  it('classifies RETURNED_TO_LO stage as rework (terminal statuses win)', () => {
    expect(isApplicationReturnedForRework('SUBMITTED', 'RETURNED_TO_LO')).toBe(true);
    expect(isApplicationReturnedForRework('DRAFT', 'RETURNED_TO_LO')).toBe(true);
    expect(isApplicationReturnedForRework('SUBMITTED', 'SUBMITTED_TO_CEO')).toBe(false);
    expect(isApplicationReturnedForRework('REJECTED')).toBe(false);
    expect(isApplicationReturnedForRework('WITHDRAWN')).toBe(false);
    expect(isApplicationReturnedForRework('DISBURSED')).toBe(false);
    expect(isApplicationReturnedForRework('REJECTED', 'RETURNED_TO_LO')).toBe(false);
    expect(isApplicationReturnedForRework('WITHDRAWN', 'RETURNED_TO_LO')).toBe(false);
    expect(isApplicationReturnedForRework('DISBURSED', 'RETURNED_TO_LO')).toBe(false);
    expect(
      isApplicationReturnedForRework('SUBMITTED', 'PENDING_LO_ACTION', 'Fix the collateral docs')
    ).toBe(true);
    expect(isApplicationReturnedForRework('SUBMITTED', 'PENDING_LO_ACTION', '')).toBe(false);
    expect(isApplicationReturnedForRework('SUBMITTED', 'PENDING_LO_ACTION', null)).toBe(false);
    expect(isApplicationReturnedForRework('REJECTED', 'PENDING_LO_ACTION', 'Fix docs')).toBe(false);
  });

  it('submitBlockedReason surfaces blocker details', () => {
    const orig = {
      ready_to_submit: false,
      blocker_details: ['Missing collateral'],
    } as OriginationStatus;
    expect(submitBlockedReason(orig)).toBe('Missing collateral');
  });
});
