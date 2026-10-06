/**
 * Normalize persisted / API user payloads into AuthUser shape.
 * Handles legacy snake_case fields from older storage formats.
 */

import type { AuthUser, UserRole } from '@/store/auth';

type RawAuthUser = {
  id?: number;
  email?: string;
  fullName?: string;
  full_name?: string | null;
  role?: UserRole | string;
  phoneNumber?: string;
  phone_number?: string | null;
  employeeId?: string;
  employee_id?: string | null;
  branchId?: number;
  branch_id?: number | null;
  bankId?: number;
  bank_id?: number | null;
  backendRole?: string;
  creditBook?: string;
  credit_book?: string | null;
  isGroupAdmin?: boolean;
  is_group_admin?: boolean;
};

export function normalizeAuthUser(raw: RawAuthUser, fallbackRole: UserRole = 'client'): AuthUser {
  const rawRole = String(raw.role ?? '')
    .trim()
    .toLowerCase();
  const safeFallback: UserRole = fallbackRole === 'staff' ? 'staff' : 'client';
  // Portal role is only client|staff. Backend job titles (e.g. "Loan Officer") must not replace it.
  let role: UserRole;
  if (rawRole === 'client' || rawRole === 'staff') {
    role = rawRole;
  } else if (raw.employeeId || raw.employee_id) {
    role = 'staff';
  } else {
    role = safeFallback;
  }
  const fullName = String(raw.fullName ?? raw.full_name ?? '').trim();
  const email = String(raw.email ?? '').trim();
  const backendRoleFromJobTitle =
    rawRole && rawRole !== 'client' && rawRole !== 'staff' ? String(raw.role).trim() : undefined;

  return {
    id: typeof raw.id === 'number' ? raw.id : 0,
    email,
    fullName,
    role,
    phoneNumber: raw.phoneNumber ?? raw.phone_number ?? undefined,
    employeeId: raw.employeeId ?? raw.employee_id ?? undefined,
    branchId: raw.branchId ?? raw.branch_id ?? undefined,
    bankId: raw.bankId ?? raw.bank_id ?? undefined,
    backendRole: raw.backendRole ?? backendRoleFromJobTitle,
    creditBook: raw.creditBook ?? raw.credit_book ?? undefined,
    isGroupAdmin: raw.isGroupAdmin ?? raw.is_group_admin ?? false,
  };
}

/** Best display name when profile/session data may load asynchronously. */
export function resolveClientDisplayName(
  user: AuthUser | null | undefined,
  sessionFullName?: string | null,
  profileFullName?: string | null
): string {
  const fromUser = user?.fullName?.trim();
  if (fromUser) return fromUser;
  const fromSession = sessionFullName?.trim();
  if (fromSession) return fromSession;
  const fromProfile = profileFullName?.trim();
  if (fromProfile) return fromProfile;
  const fromEmail = user?.email?.trim();
  if (fromEmail) return fromEmail.split('@')[0] ?? fromEmail;
  if (user || sessionFullName || profileFullName) return 'CoFi Client';
  return 'Guest';
}

/** Best display email from auth user or profile API. */
export function resolveClientDisplayEmail(
  user: AuthUser | null | undefined,
  profileEmail?: string | null
): string {
  return user?.email?.trim() || profileEmail?.trim() || '';
}
