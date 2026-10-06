/**
 * Role-aware client list scoping for staff KYC / client screens.
 *
 * Loan officers stay on "assigned to me".
 * CIOs use the zone client book (`GET /staff/cio/portfolio-clients`), not the branch-wide list.
 * Branch managers, portfolio, compliance, and admins get branch-wide visibility.
 */

import { isCreditOfficerStaffRole, normalizeStaffRole } from '@/lib/loan-origination/origination-workflow';

function normalizeRole(role?: string | null): string {
  return normalizeStaffRole(role);
}

/** Roles that should see all clients in their branch (not only assigned). CIOs excluded. */
const BRANCH_WIDE_ROLES = new Set([
  'BRANCH_MANAGER',
  'PORTFOLIO_MANAGER',
  'COMPLIANCE_OFFICER',
  'COMPLIANCE',
  'OPERATIONS_OFFICER',
  'OPERATIONS_MANAGER',
  'OPERATIONS_ASSISTANT',
  'OPS_OFFICER',
  'OPS_MANAGER',
  'OPS_ASSISTANT',
  'CEO',
  'CHIEF_EXECUTIVE',
  'CHIEF_EXECUTIVE_OFFICER',
  'GCEO',
  'GENERAL_CHIEF_EXECUTIVE',
  'GENERAL_CHIEF_EXECUTIVE_OFFICER',
  'ADMIN',
  'SUPER_ADMIN',
]);

const CIO_ROLES = new Set([
  'CREDIT_INVESTMENT_OFFICER',
  'CREDIT_AND_INVESTMENT_OFFICER',
  'CIO',
  'SENIOR_CREDIT_INVESTMENT_OFFICER',
  'SCIO',
]);

export type ClientListScope = {
  /** Loan-officer personal book */
  assignedToMe: boolean;
  /** Branch-wide list when the API allows it for the role */
  allBranchClients: boolean;
  /** CIO branch-wide lists show completed profiles only (drafts stay on LO books). */
  completedOnlyBranchWide: boolean;
  /** CIO zone client book (`GET /staff/cio/portfolio-clients`) */
  cioSupervisedPortfolio: boolean;
};

/**
 * Resolve list filters for GET /clients based on staff backend role / permissions.
 */
export function resolveStaffClientListScope(
  backendRole: string | null | undefined,
  hasPermission?: (code: string) => boolean
): ClientListScope {
  const role = normalizeRole(backendRole);
  if (hasPermission?.('client:view_all') || hasPermission?.('clients:view_all')) {
    return {
      assignedToMe: false,
      allBranchClients: true,
      completedOnlyBranchWide: false,
      cioSupervisedPortfolio: false,
    };
  }
  if (CIO_ROLES.has(role) || isCreditOfficerStaffRole(role)) {
    return {
      assignedToMe: false,
      allBranchClients: false,
      completedOnlyBranchWide: false,
      cioSupervisedPortfolio: true,
    };
  }
  if (BRANCH_WIDE_ROLES.has(role)) {
    return {
      assignedToMe: false,
      allBranchClients: true,
      completedOnlyBranchWide: false,
      cioSupervisedPortfolio: false,
    };
  }
  // Default LO / field officer book — includes draft profiles
  return {
    assignedToMe: true,
    allBranchClients: false,
    completedOnlyBranchWide: false,
    cioSupervisedPortfolio: false,
  };
}
