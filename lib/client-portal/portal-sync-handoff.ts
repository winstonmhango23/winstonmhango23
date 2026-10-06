/**
 * Complete portal registration after background sync (any screen — not only /register).
 */

import { applyClientRegistrationTokens } from '@/lib/client-portal/complete-registration';
import { consumePortalRegistrationReady } from '@/lib/sync/sync-service';
import { useAuthStore } from '@/store/auth';

let handoffInFlight = false;

export async function tryCompletePortalRegistrationHandoff(): Promise<boolean> {
  if (handoffInFlight) return false;
  const { hydrated, token } = useAuthStore.getState();
  if (!hydrated || token) return false;

  handoffInFlight = true;
  try {
    const ready = await consumePortalRegistrationReady();
    if (!ready) return false;

    const { setAuth } = useAuthStore.getState();
    await applyClientRegistrationTokens(
      { access_token: ready.accessToken, refresh_token: ready.refreshToken },
      { email: ready.email, fullName: ready.fullName },
      setAuth
    );

    const { router } = await import('expo-router');
    router.replace('/kyc');
    return true;
  } finally {
    handoffInFlight = false;
  }
}
