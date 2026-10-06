import type { AuthUser, UserRole } from '@/store/auth';

export type SessionMode = 'online' | 'offline';

export type LoginResult =
  | {
      success: true;
      role: UserRole;
      mode: SessionMode;
      /** Shown when signing in offline — credentials verified locally. */
      notice?: string;
    }
  | {
      success: false;
      error: string;
      code:
        | 'invalid_credentials'
        | 'no_offline_cache'
        | 'offline_expired'
        | 'network'
        | 'server';
    };

export type SessionValidationResult =
  | { valid: true; mode: 'online' }
  | { valid: false; reason: 'offline' | 'expired' | 'unauthorized' | 'no_session' };

export interface OfflineCredentialRecord {
  emailNormalized: string;
  role: UserRole;
  verifier: string;
  verifierVersion: number;
  userSnapshot: AuthUser;
  lastOnlineAuthAt: string;
  lastOfflineAuthAt: string | null;
  pendingServerValidation: boolean;
  storedToken: string | null;
  storedRefreshToken: string | null;
  updatedAt: string;
}

export interface SessionMetadata {
  sessionMode: SessionMode;
  lastOnlineValidatedAt: string | null;
  pendingServerValidation: boolean;
}
