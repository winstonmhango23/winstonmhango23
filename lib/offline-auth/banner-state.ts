import type { SessionMode } from '@/lib/offline-auth/types';

export type OfflineAuthBannerIcon = 'lock-clock' | 'verified-user';

export type OfflineAuthBannerState =
  | { visible: false }
  | { visible: true; message: string; icon: OfflineAuthBannerIcon };

/** Pure visibility + copy for OfflineAuthBanner (unit-testable). */
export function resolveOfflineAuthBannerState(params: {
  token: string | null;
  sessionMode: SessionMode | null;
  pendingServerValidation: boolean;
  isConnected: boolean | null | undefined;
}): OfflineAuthBannerState {
  if (!params.token) return { visible: false };
  if (params.sessionMode !== 'offline' && !params.pendingServerValidation) {
    return { visible: false };
  }

  const offline = params.isConnected === false;
  return {
    visible: true,
    message: offline
      ? 'Offline session — sign-in will be verified when you reconnect.'
      : 'Verifying your session with the server…',
    icon: offline ? 'lock-clock' : 'verified-user',
  };
}
