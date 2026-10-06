/**
 * Shared post-auth navigation for borrower clients (login, welcome, hydrate).
 */

import type { Router } from 'expo-router';

import { fetchMobileKyc, fetchMobileSession } from '@/lib/client-portal/api';
import { applyMobileSessionToAuth } from '@/lib/client-portal/session-auth';
import {
  clientAuthDestinationHref,
  resolveClientAuthDestination,
  withOptimisticKycSession,
} from '@/lib/client-portal/kyc-routing';
import { useClientSessionStore } from '@/store/client-session';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

/** Resolve KYC/session and navigate to the correct client destination. */
export async function navigateClientAfterAuth(
  router: Router,
  token: string
): Promise<void> {
  try {
    const [kycData, session] = await Promise.all([
      fetchMobileKyc(token),
      fetchMobileSession(token),
    ]);
    const sessionForRouting = withOptimisticKycSession(session, kycData);
    useClientSessionStore.getState().setSession(sessionForRouting);
    await applyMobileSessionToAuth(sessionForRouting, token);
    // Ensure home bootstrap can run once after a fresh sign-in.
    useHomeBootstrapStore.getState().reset();
    const dest = resolveClientAuthDestination(sessionForRouting, kycData);
    router.replace(clientAuthDestinationHref(dest));
  } catch {
    router.replace('/kyc');
  }
}
