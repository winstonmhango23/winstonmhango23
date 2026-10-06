/**
 * Account-scoped local storage identity.
 *
 * Scope IDs are stable across token refresh (role + user id).
 * A short token fingerprint is stored alongside the active session so we can
 * recognise which access token the namespace was bound to — without using the
 * raw JWT as a storage key (JWTs rotate and would orphan offline data).
 */

export type AccountRole = 'client' | 'staff';

export interface AccountPrincipal {
  role: AccountRole;
  id: number;
}

export interface ActiveAccountScope {
  /** Stable namespace, e.g. `staff_42` / `client_7`. */
  scopeId: string;
  role: AccountRole;
  userId: number;
  /** First 12 hex chars of a hash of the access token (recognition only). */
  tokenFingerprint: string;
  activatedAt: string;
}

/** KV / DB prefix segment — keep short for SecureStore key limits. */
export const ACCOUNT_SCOPE_PREFIX = 'cofi.a';

export const ACTIVE_SCOPE_META_KEY = 'cofi_active_account_scope';
