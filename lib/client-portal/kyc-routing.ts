import type { Href } from 'expo-router';

import type { MobileClientSessionContext } from '@/lib/data/api';

import {
  isKYCCompleteForDashboard,
  type ClientKYCData,
} from './kyc-completion-calculator';
import { prepareKycDataForCompletion } from './kyc-data-normalizer';

export type ClientAuthDestination = '/(client)' | '/kyc' | '/(client)/kyc';

/** True when session flag or local KYC payload is complete enough for dashboard. */
export function isClientKycCompleteForRouting(
  session: MobileClientSessionContext,
  kycData?: ClientKYCData | null
): boolean {
  if (session.kyc_is_complete === true) return true;
  if (!kycData) return false;
  const prepared = prepareKycDataForCompletion(kycData, session.client_type);
  return isKYCCompleteForDashboard(prepared);
}

/**
 * Block dashboard for new borrowers until KYC is complete.
 * Prefer passing `kycData` so client-side completion matches login/KYC routing.
 */
export function shouldBlockClientDashboard(
  session: MobileClientSessionContext,
  kycData?: ClientKYCData | null
): boolean {
  if (isClientKycCompleteForRouting(session, kycData)) return false;
  return !session.has_existing_loans;
}

/** Merge session with optimistic KYC completeness (avoids post-submit redirect loops). */
export function withOptimisticKycSession(
  session: MobileClientSessionContext,
  kycData: ClientKYCData
): MobileClientSessionContext {
  if (session.kyc_is_complete) return session;
  const prepared = prepareKycDataForCompletion(kycData, session.client_type);
  if (!isKYCCompleteForDashboard(prepared)) return session;
  return {
    ...session,
    kyc_is_complete: true,
    kyc_required_percentage: 100,
    kyc_completion_percentage: Math.max(session.kyc_completion_percentage ?? 0, 100),
  };
}

/** Post-login / post-register routing based on session + KYC state. */
export function resolveClientAuthDestination(
  session: MobileClientSessionContext,
  kycData: ClientKYCData
): ClientAuthDestination {
  if (isClientKycCompleteForRouting(session, kycData)) {
    return '/(client)';
  }
  if (session.has_existing_loans) {
    return '/(client)/kyc';
  }
  return '/kyc';
}

export function clientAuthDestinationHref(dest: ClientAuthDestination): Href {
  return dest as Href;
}
