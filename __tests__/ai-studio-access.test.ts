import { isMeOfficerStaffRole, staffHasAiStudio } from '@/lib/staff/ai-studio-access';

describe('staffHasAiStudio', () => {
  it('matches the dashboard roles that expose AI Studio', () => {
    expect(staffHasAiStudio('CREDIT_INVESTMENT_OFFICER')).toBe(true);
    expect(staffHasAiStudio('SENIOR_CREDIT_INVESTMENT_OFFICER')).toBe(true);
    expect(staffHasAiStudio('CIO')).toBe(true);
    expect(staffHasAiStudio('LOAN_OFFICER')).toBe(true);
    expect(staffHasAiStudio('OPERATIONS_OFFICER')).toBe(true);
    expect(staffHasAiStudio('OPERATIONS_ASSISTANT')).toBe(true);
    expect(staffHasAiStudio('OPERATIONS_MANAGER')).toBe(true);
    expect(staffHasAiStudio('PORTFOLIO_MANAGER')).toBe(true);
    expect(staffHasAiStudio('CEO')).toBe(true);
    expect(staffHasAiStudio('GCEO')).toBe(true);
    expect(staffHasAiStudio('ACCOUNTANT')).toBe(true);
    expect(staffHasAiStudio('AUDITOR')).toBe(true);
    expect(staffHasAiStudio('INTERNAL_AUDITOR')).toBe(true);
    expect(staffHasAiStudio('MONITORING_AND_EVALUATION_OFFICER')).toBe(true);
    expect(staffHasAiStudio('ME_OFFICER')).toBe(true);
  });

  it('excludes external auditor and unmapped staff', () => {
    expect(staffHasAiStudio('EXTERNAL_AUDITOR')).toBe(false);
    expect(staffHasAiStudio('TELLER')).toBe(false);
    expect(staffHasAiStudio(null)).toBe(false);
  });
});

describe('isMeOfficerStaffRole', () => {
  it('recognizes M&E aliases from dashboard and API', () => {
    expect(isMeOfficerStaffRole('me_officer')).toBe(true);
    expect(isMeOfficerStaffRole('Monitoring and Evaluation Officer')).toBe(true);
    expect(isMeOfficerStaffRole('LOAN_OFFICER')).toBe(false);
  });
});
