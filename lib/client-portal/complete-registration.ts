import { config } from '@/lib/config';
import type { ClientAuthTokenResponse } from '@/lib/client-portal/api';
import type { AuthUser } from '@/store/auth';

export type RegistrationProfile = {
  email?: string;
  fullName: string;
  clientId?: string;
};

/** Apply portal registration tokens and enrich profile from customer dashboard when online. */
export async function applyClientRegistrationTokens(
  tokenRes: ClientAuthTokenResponse,
  profile: RegistrationProfile,
  setAuth: (user: AuthUser, token: string, refreshToken?: string) => Promise<void>
): Promise<void> {
  const token = tokenRes.access_token;
  const refreshToken = tokenRes.refresh_token;
  await setAuth(
    {
      id: 0,
      email: profile.email ?? '',
      fullName: profile.fullName,
      role: 'client',
      clientId: profile.clientId,
    },
    token,
    refreshToken
  );

  try {
    const dashRes = await fetch(config.customer.dashboard, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (dashRes.ok) {
      const dash = await dashRes.json();
      const ci = dash?.client_info;
      if (ci) {
        await setAuth(
          {
            id: ci.id ?? 0,
            email: ci.email ?? profile.email ?? '',
            fullName: ci.full_name ?? profile.fullName,
            role: 'client',
            phoneNumber: ci.phone_number,
            clientId: String(ci.client_id ?? profile.clientId ?? ''),
          },
          token,
          refreshToken
        );
      }
    }
  } catch {
    /* keep registration auth */
  }
}
