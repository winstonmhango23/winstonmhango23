import {
  crbCreditBookLabel,
  crbScopeLabel,
  crbTypeLabel,
  crbWorkspaceCopy,
  resolveCrbWorkspaceMode,
  summarizeCrbReport,
} from '@/lib/crb/report-utils';

describe('CRB role distillation', () => {
  it('maps officer roles onto the reusable workspace', () => {
    expect(resolveCrbWorkspaceMode('LOAN_OFFICER')).toBe('loan_officer');
    expect(resolveCrbWorkspaceMode('CIO')).toBe('cio');
    expect(resolveCrbWorkspaceMode('SCIO')).toBe('cio');
    expect(resolveCrbWorkspaceMode('SENIOR_CREDIT_INVESTMENT_OFFICER')).toBe('cio');
    expect(resolveCrbWorkspaceMode('OPERATIONS_OFFICER')).toBe('ops_officer');
    expect(resolveCrbWorkspaceMode('OPERATIONS_ASSISTANT')).toBe('ops_officer');
    expect(resolveCrbWorkspaceMode('operations-assistant')).toBe('ops_officer');
    expect(resolveCrbWorkspaceMode('OPERATIONS_MANAGER')).toBe('ops_manager');
    expect(resolveCrbWorkspaceMode('ACCOUNTANT')).toBe('loan_officer');
  });

  it('labels scope and report types', () => {
    expect(crbScopeLabel({ scope: { mode: 'BOOK' } })).toMatch(/assigned clients/i);
    expect(crbScopeLabel({ scope: { mode: 'SUPERVISED_PORTFOLIO' } })).toMatch(/supervised/i);
    expect(crbTypeLabel('EXISTING_CLIENTS_CRB')).toBe('Existing clients');
    expect(crbWorkspaceCopy('cio').generateTitle).toMatch(/portfolio/i);
    expect(crbWorkspaceCopy('ops_officer').subtitle).toMatch(/assistant/i);
    expect(crbWorkspaceCopy('ops_manager').subtitle).toMatch(/assistants/);
    expect(
      summarizeCrbReport({
        report_type: 'PORTFOLIO_CRB',
        summary: { total_clients: 4, total_loans: 7 },
      })
    ).toContain('4 clients');
    expect(crbCreditBookLabel('SME')).toBe('SME');
    expect(crbCreditBookLabel('GROUP')).toBe('Group');
    expect(crbCreditBookLabel('ALL')).toBe('All types');
  });
});
