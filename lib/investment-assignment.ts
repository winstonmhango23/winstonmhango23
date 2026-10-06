import {
  isAccountantStaffRole,
  isCreditOfficerStaffRole,
  isLoanOfficerStaffRole,
  isOperationsAssistantStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
  isPortfolioManagerStaffRole,
  normalizeStaffRole,
} from '@/lib/loan-origination/origination-workflow';

export type InvestmentAssignmentFields = {
  investmentAssigned?: boolean | null;
  investment_assigned?: boolean | null;
  allocationId?: number | null;
  allocation_id?: number | null;
  fundingFundName?: string | null;
  funding_fund_name?: string | null;
};

function isAdminStaffRole(role?: string | null): boolean {
  const normalized = normalizeStaffRole(role);
  return normalized === 'ADMIN' || normalized === 'SUPER_ADMIN' || normalized === 'SUPERADMIN';
}

function isClientPortalRole(role?: string | null): boolean {
  const normalized = normalizeStaffRole(role);
  return normalized === 'CLIENT' || normalized === 'CUSTOMER';
}

/** Portfolio manager, accountant, operations officer/assistant/manager, and admins. */
export function canAssignLoanInvestment(role?: string | null): boolean {
  if (isAdminStaffRole(role)) return true;
  if (isCreditOfficerStaffRole(role) || isLoanOfficerStaffRole(role) || isClientPortalRole(role)) {
    return false;
  }
  return (
    isPortfolioManagerStaffRole(role) ||
    isAccountantStaffRole(role) ||
    isOperationsOfficerStaffRole(role) ||
    isOperationsAssistantStaffRole(role) ||
    isOperationsManagerStaffRole(role)
  );
}

/** Every staff level except CIO, loan officer, and client. */
export function canViewLoanInvestmentAssignment(role?: string | null): boolean {
  if (!role) return false;
  if (isAdminStaffRole(role)) return true;
  if (isCreditOfficerStaffRole(role) || isLoanOfficerStaffRole(role) || isClientPortalRole(role)) {
    return false;
  }
  return true;
}

export function isInvestmentAssigned(loan: InvestmentAssignmentFields): boolean {
  if (loan.investmentAssigned === true || loan.investment_assigned === true) return true;
  const allocation = loan.allocationId ?? loan.allocation_id ?? null;
  const name = String(loan.fundingFundName ?? loan.funding_fund_name ?? '').trim();
  return allocation != null || name.length > 0;
}
