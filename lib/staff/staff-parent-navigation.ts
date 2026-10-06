import type { Href } from 'expo-router';

import {
  staffClientProfileHref,
  type StaffClientHrefOptions,
} from '@/lib/staff/client-file-links';

const STAFF_CLIENTS_HREF = '/(staff)/clients' as Href;
const STAFF_APPLICATIONS_HREF = '/(staff)/applications' as Href;
const STAFF_LOANS_HREF = '/(staff)/loans' as Href;

type NavRouter = {
  canGoBack?: () => boolean;
  back: () => void;
  replace: (href: Href) => void;
};

export function sanitizeStaffReturnTo(raw?: string | null): Href | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.includes('://')) return null;
  if (value.startsWith('/login')) return null;
  return value as Href;
}

export function staffApplicationHref(applicationId: number | string): Href {
  return `/(staff)/applications/${applicationId}` as Href;
}

export function staffLoanHref(loanId: number | string): Href {
  return `/(staff)/loans/${loanId}` as Href;
}

export function resolveStaffClientParentHref(input: {
  clientId: string;
  section?: string | null;
  returnTo?: string | null;
}): Href {
  const returnTo = sanitizeStaffReturnTo(input.returnTo);
  const section = String(input.section || '').replace(/^\//, '');
  if (section) {
    if (returnTo) return returnTo;
    return staffClientProfileHref(input.clientId);
  }
  if (returnTo) return returnTo;
  return STAFF_CLIENTS_HREF;
}

export function goToStaffClientParent(
  router: NavRouter,
  input: { clientId: string; section?: string | null; returnTo?: string | null }
): void {
  router.replace(resolveStaffClientParentHref(input));
}

export function staffReturnOptions(returnTo?: string | null): StaffClientHrefOptions | undefined {
  const safe = sanitizeStaffReturnTo(returnTo);
  return safe ? { returnTo: String(safe) } : undefined;
}

export { STAFF_CLIENTS_HREF, STAFF_APPLICATIONS_HREF, STAFF_LOANS_HREF };
