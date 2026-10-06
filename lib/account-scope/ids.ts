import * as Crypto from 'expo-crypto';

import type { AccountPrincipal, AccountRole } from '@/lib/account-scope/types';

export function normalizeAccountRole(role: string | null | undefined): AccountRole {
  return role === 'staff' ? 'staff' : 'client';
}

/** Stable per-account namespace used for SQLite filenames and AsyncStorage prefixes. */
export function buildAccountScopeId(principal: AccountPrincipal): string {
  const role = normalizeAccountRole(principal.role);
  const id = Number(principal.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Account scope requires a positive user id');
  }
  return `${role}_${Math.trunc(id)}`;
}

/**
 * Compact fingerprint of the access token for active-scope metadata.
 * Not used as the storage key — only to recognise token/session binding.
 */
export async function fingerprintAccessToken(token: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    token.trim()
  );
  return digest.slice(0, 12);
}

export function scopedKvKey(scopeId: string, key: string): string {
  return `cofi.a.${scopeId}.${key}`;
}

export function scopedDatabaseName(scopeId: string): string {
  // expo-sqlite accepts simple filenames; keep alphanumeric + underscore.
  const safe = scopeId.replace(/[^a-zA-Z0-9_]/g, '_');
  return `cofi_loan_app__${safe}.db`;
}

export const SHARED_AUTH_DATABASE_NAME = 'cofi_auth_shared.db';
