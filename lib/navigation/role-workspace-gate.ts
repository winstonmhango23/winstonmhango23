/**
 * Role gates for mobile executive / back-office workspace shells.
 * LO field ops should not see fake CEO/CIO/Accountant/Ops dashboards as if they were live.
 */

const ROLE_ALIASES: Record<string, string[]> = {
  CEO: ['CEO', 'CHIEF_EXECUTIVE', 'CHIEF_EXECUTIVE_OFFICER'],
  GCEO: ['GCEO', 'GENERAL_CHIEF_EXECUTIVE', 'GENERAL_CHIEF_EXECUTIVE_OFFICER'],
  CIO: [
    'CIO',
    'SCIO',
    'CREDIT_INVESTMENT_OFFICER',
    'CREDIT_AND_INVESTMENT_OFFICER',
    'SENIOR_CREDIT_INVESTMENT_OFFICER',
  ],
  ACCOUNTANT: ['ACCOUNTANT'],
  PORTFOLIO_MANAGER: [
    'PORTFOLIO_MANAGER',
    'PM',
    'PORTFOLIO-MANAGER',
    'PORTFOLIOMANAGER',
  ],
  OPERATIONS_OFFICER: ['OPERATIONS_OFFICER', 'OPS_OFFICER'],
  OPERATIONS_MANAGER: ['OPERATIONS_MANAGER', 'OPS_MANAGER'],
  OPERATIONS_ASSISTANT: ['OPERATIONS_ASSISTANT', 'OPS_ASSISTANT'],
  OPERATIONS: [
    'OPERATIONS_OFFICER',
    'OPERATIONS_MANAGER',
    'OPS_OFFICER',
    'OPS_MANAGER',
    'OPERATIONS_ASSISTANT',
    'OPS_ASSISTANT',
  ],
  ADMIN: ['ADMIN', 'SUPER_ADMIN'],
  AUDITOR: ['AUDITOR', 'INTERNAL_AUDITOR'],
  EXTERNAL_AUDITOR: ['EXTERNAL_AUDITOR'],
};

function normalizeRole(role?: string | null): string {
  return (role ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function backendRoleMatches(
  backendRole: string | undefined | null,
  allowedFamilies: Array<keyof typeof ROLE_ALIASES>
): boolean {
  const role = normalizeRole(backendRole);
  if (!role) return false;
  if (ROLE_ALIASES.ADMIN.includes(role)) return true;
  return allowedFamilies.some((family) => ROLE_ALIASES[family]?.includes(role));
}

export function desktopOnlyWorkspaceMessage(workspace: string): string {
  return `${workspace} is a desktop BMS workspace. Use the web dashboard for the full experience.`;
}
