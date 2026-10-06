export { signInWithOfflineSupport } from '@/lib/offline-auth/auth-service';
export {
  validateAndRefreshSession,
  validateSessionOnReconnect,
  isOfflineSessionExpired,
  parseSessionMetadata,
} from '@/lib/offline-auth/session-validator';
export {
  upsertOfflineCredential,
  verifyOfflineCredential,
  clearAllOfflineCredentials,
  deleteOfflineCredential,
} from '@/lib/offline-auth/credential-store';
export {
  computePasswordVerifier,
  verifyPassword,
  normalizeEmail,
  timingSafeEqual,
} from '@/lib/offline-auth/crypto';
export { resolveOfflineAuthBannerState } from '@/lib/offline-auth/banner-state';
export type { OfflineAuthBannerState } from '@/lib/offline-auth/banner-state';
export type { LoginResult, SessionMode, SessionMetadata } from '@/lib/offline-auth/types';
export { OFFLINE_SESSION_MAX_DAYS } from '@/lib/offline-auth/constants';
