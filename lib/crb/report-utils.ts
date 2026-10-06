/**
 * Shared CRB distillation: global capability, then officer / client / loan scope.
 */

export type CrbWorkspaceMode = 'loan_officer' | 'cio' | 'ops_officer' | 'ops_manager';

export type CrbScopeDescriptor = {
  mode?: string | null;
  label?: string | null;
  client_id?: number | null;
  loan_id?: number | null;
};

export function normalizeCrbRole(role?: string | null): string {
  return String(role ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function resolveCrbWorkspaceMode(role?: string | null): CrbWorkspaceMode | null {
  const r = normalizeCrbRole(role);
  if (!r) return null;
  if (r === 'OPERATIONS_MANAGER' || r === 'OPS_MANAGER') return 'ops_manager';
  if (
    r === 'OPERATIONS_OFFICER' ||
    r === 'OPS_OFFICER' ||
    r === 'OPERATIONS_ASSISTANT' ||
    r === 'OPS_ASSISTANT'
  ) {
    return 'ops_officer';
  }
  if (
    r === 'CIO' ||
    r === 'SCIO' ||
    r === 'CREDIT_INVESTMENT_OFFICER' ||
    r === 'CREDIT_AND_INVESTMENT_OFFICER' ||
    r === 'SENIOR_CREDIT_INVESTMENT_OFFICER'
  ) {
    return 'cio';
  }
  if (r === 'LOAN_OFFICER' || r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'ACCOUNTANT') {
    return 'loan_officer';
  }
  return 'loan_officer';
}

export function crbCreditBookLabel(book?: string | null): string {
  const k = String(book || '').trim().toUpperCase();
  if (k === 'SME') return 'SME';
  if (k === 'GROUP') return 'Group';
  return 'All types';
}

export function crbTypeLabel(type: string): string {
  const t = (type || '').toUpperCase();
  if (t.includes('NEW_CLIENT')) return 'New clients';
  if (t.includes('EXISTING_CLIENT')) return 'Existing clients';
  if (t.includes('ACTIVE_LOAN')) return 'Active loans';
  if (t.includes('PORTFOLIO')) return 'Portfolio';
  return type.replace(/_/g, ' ');
}

export function crbScopeLabel(report: {
  scope?: CrbScopeDescriptor | null;
  scope_label?: string | null;
}): string {
  if (report.scope_label) return report.scope_label;
  const scope = report.scope;
  if (scope?.label) return scope.label;
  const mode = (scope?.mode || '').toUpperCase();
  if (mode === 'BOOK') return "This officer's assigned clients and booked loans";
  if (mode === 'SUPERVISED_PORTFOLIO') return 'Clients and booked loans of supervised officers';
  if (mode === 'BRANCH') return 'All clients and loans in the selected branch';
  if (mode === 'CLIENT') return "One client and that client's loans";
  if (mode === 'LOAN') return 'One booked loan and its client';
  if (mode === 'GLOBAL') return 'Institution-wide clients and loans';
  return '';
}

export function summarizeCrbReport(report: {
  report_type: string;
  summary?: Record<string, unknown> | null;
}): string {
  const s = report.summary || {};
  if (report.report_type === 'PORTFOLIO_CRB') {
    return `${s.total_clients ?? 0} clients · ${s.total_loans ?? 0} loans`;
  }
  const bureauRows = Number(s.bureau_row_count ?? 0);
  if (report.report_type === 'NEW_CLIENTS_CRB') {
    return `${s.total_new_clients ?? bureauRows} first-time borrowers`;
  }
  if (report.report_type === 'EXISTING_CLIENTS_CRB') {
    return `${s.total_existing_clients ?? bureauRows} existing clients`;
  }
  return `${s.total_active_loans ?? bureauRows} loans · PAR30+ ${s.par_30_plus ?? 0}`;
}

export function crbWorkspaceCopy(mode: CrbWorkspaceMode): {
  title: string;
  subtitle: string;
  generateTitle: string;
} {
  if (mode === 'loan_officer') {
    return {
      title: 'CRB reports',
      subtitle: 'Generate snapshots for your assigned clients and booked loans, then forward to your CIO.',
      generateTitle: 'Generate for my book',
    };
  }
  if (mode === 'cio') {
    return {
      title: 'CRB reports',
      subtitle: 'Review forwarded reports and generate snapshots of supervised officers clients and loans.',
      generateTitle: 'Generate portfolio snapshot',
    };
  }
  if (mode === 'ops_manager') {
    return {
      title: 'CRB reports',
      subtitle:
        'Review branch CRB packages submitted by operations officers and assistants.',
      generateTitle: 'Generate branch snapshot',
    };
  }
  return {
    title: 'CRB reports',
    subtitle:
      'Generate a branch credit-bureau package as an operations officer or assistant, then submit it to the Operations Manager.',
    generateTitle: 'Generate branch package',
  };
}
