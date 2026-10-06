import {
  isAccountantStaffRole,
  isCeoStaffRole,
  isCreditOfficerStaffRole,
  isExternalAuditorStaffRole,
  isGceoStaffRole,
  isInternalAuditorStaffRole,
  isLoanOfficerStaffRole,
  isOperationsAssistantStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
  isPortfolioManagerStaffRole,
  normalizeStaffRole,
} from '@/lib/loan-origination/origination-workflow';

/** Same entry the dashboard sidebar uses for AI Studio. */
export const AI_STUDIO_HREF = '/(staff)/ai-studio';

export const AI_STUDIO_TILE_HINT =
  'Malawi-aware loan analytics, PAR, repayments, GL, and regulatory insights scoped to your role';

/** M&E has AI Studio on the dashboard but no dedicated mobile workspace. */
export function isMeOfficerStaffRole(role?: string | null): boolean {
  const r = normalizeStaffRole(role);
  if (!r) return false;
  if (
    r === 'MONITORING_AND_EVALUATION_OFFICER' ||
    r === 'ME_OFFICER' ||
    r === 'M_E_OFFICER' ||
    r === 'M_AND_E_OFFICER'
  ) {
    return true;
  }
  if (r.includes('MONITORING') && r.includes('EVALUATION')) return true;
  return (r.includes('M&E') || r.includes('M_E') || r === 'ME') && r.includes('OFFICER');
}

/**
 * Roles that see AI Studio on the web dashboard.
 * External auditor is excluded; backend still enforces module access.
 */
export function staffHasAiStudio(role?: string | null): boolean {
  if (isExternalAuditorStaffRole(role)) return false;
  return (
    isCreditOfficerStaffRole(role) ||
    isLoanOfficerStaffRole(role) ||
    isOperationsOfficerStaffRole(role) ||
    isOperationsAssistantStaffRole(role) ||
    isOperationsManagerStaffRole(role) ||
    isPortfolioManagerStaffRole(role) ||
    isCeoStaffRole(role) ||
    isGceoStaffRole(role) ||
    isAccountantStaffRole(role) ||
    isInternalAuditorStaffRole(role) ||
    isMeOfficerStaffRole(role)
  );
}
