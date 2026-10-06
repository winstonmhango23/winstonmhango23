/**
 * Staff-only account activation / KYC verification on the mobile app.
 * Borrowers must never verify or activate client accounts.
 */

import type { AuthUser } from '@/store/auth';

function normalizeRole(role?: string | null): string {
  return String(role ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

/** Roles allowed to activate / verify clients from the staff mobile app. */
const STAFF_VERIFY_ROLES = new Set([
  'LOAN_OFFICER',
  'OFFICER',
  'CREDIT_INVESTMENT_OFFICER',
  'CREDIT_AND_INVESTMENT_OFFICER',
  'SENIOR_CREDIT_INVESTMENT_OFFICER',
  'CIO',
  'SCIO',
  'BRANCH_MANAGER',
  'PORTFOLIO_MANAGER',
  'ADMIN',
  'SUPER_ADMIN',
]);

/**
 * True when the signed-in staff user may verify / activate a client account.
 * Requires staff portal role plus either client:approve or an eligible backend role.
 */
export function canStaffActivateOrVerifyClient(
  user: Pick<AuthUser, 'role' | 'backendRole'> | null | undefined,
  hasPermission: (code: string) => boolean
): boolean {
  if (!user || user.role !== 'staff') return false;
  if (hasPermission('client:approve')) return true;
  const backend = normalizeRole(user.backendRole);
  return STAFF_VERIFY_ROLES.has(backend);
}
