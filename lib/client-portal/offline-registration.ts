/**
 * Queue borrower self-registration while offline.
 *
 * Sign-up happens before anyone is authenticated, so these rows go to the
 * shared database rather than the account-scoped one — there is no account
 * scope to open yet.
 */

import { sqliteEnqueuePortalRegistration } from '@/lib/data/sqlite';

import type { PortalGroupRegisterPayload, PortalIndividualRegisterPayload } from './api';

function registrationKey(prefix: string, email: string | undefined, fallback: string): string {
  const normalized = (email ?? '').trim().toLowerCase();
  return `${prefix}-${normalized || fallback}`;
}

export async function queuePortalIndividualRegistration(
  payload: PortalIndividualRegisterPayload
): Promise<void> {
  // Village borrowers often have no email, so fall back to the national ID.
  const localId = registrationKey(
    'portal-ind',
    payload.email,
    (payload.national_id ?? '').trim().toLowerCase() || String(Date.now())
  );
  await sqliteEnqueuePortalRegistration('CREATE_PORTAL_INDIVIDUAL', localId, payload);
}

export async function queuePortalGroupRegistration(
  payload: PortalGroupRegisterPayload
): Promise<void> {
  const localId = registrationKey(
    'portal-grp',
    payload.email,
    (payload.organization_name ?? '').trim().toLowerCase() || String(Date.now())
  );
  await sqliteEnqueuePortalRegistration('CREATE_PORTAL_GROUP', localId, payload);
}
