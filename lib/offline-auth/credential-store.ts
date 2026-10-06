/**
 * SQLite replica of last-known-good credentials for offline sign-in.
 * Stores verifier digest + user snapshot — never plaintext passwords.
 */

import { normalizeEmail, computePasswordVerifier } from '@/lib/offline-auth/crypto';
import { getDeviceSecret } from '@/lib/offline-auth/device-secret';
import { getOfflineAuthDb } from '@/lib/offline-auth/db';
import { VERIFIER_VERSION } from '@/lib/offline-auth/constants';
import type { OfflineCredentialRecord } from '@/lib/offline-auth/types';
import { normalizeAuthUser } from '@/lib/auth-user';
import type { AuthUser, UserRole } from '@/store/auth';

type CredentialRow = {
  email_normalized: string;
  role: string;
  verifier: string;
  verifier_version: number;
  user_snapshot: string;
  last_online_auth_at: string;
  last_offline_auth_at: string | null;
  pending_server_validation: number;
  stored_token: string | null;
  stored_refresh_token: string | null;
  updated_at: string;
};

function rowToRecord(row: CredentialRow): OfflineCredentialRecord {
  const snapshot = JSON.parse(row.user_snapshot) as Record<string, unknown>;
  const role = (row.role === 'staff' ? 'staff' : 'client') as UserRole;
  return {
    emailNormalized: row.email_normalized,
    role,
    verifier: row.verifier,
    verifierVersion: row.verifier_version,
    userSnapshot: normalizeAuthUser(snapshot, role),
    lastOnlineAuthAt: row.last_online_auth_at,
    lastOfflineAuthAt: row.last_offline_auth_at,
    pendingServerValidation: row.pending_server_validation === 1,
    storedToken: row.stored_token,
    storedRefreshToken: row.stored_refresh_token,
    updatedAt: row.updated_at,
  };
}

export async function upsertOfflineCredential(params: {
  email: string;
  password: string;
  role: UserRole;
  user: AuthUser;
  token: string;
  refreshToken?: string | null;
  pendingServerValidation?: boolean;
}): Promise<void> {
  const database = await getOfflineAuthDb();
  const emailNormalized = normalizeEmail(params.email);
  const deviceSecret = await getDeviceSecret();
  const verifier = await computePasswordVerifier(
    deviceSecret,
    params.role,
    params.email,
    params.password
  );
  const now = new Date().toISOString();

  await database.runAsync(
    `INSERT INTO offline_auth_credentials (
      email_normalized, role, verifier, verifier_version, user_snapshot,
      last_online_auth_at, last_offline_auth_at, pending_server_validation,
      stored_token, stored_refresh_token, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?)
    ON CONFLICT(email_normalized) DO UPDATE SET
      role = excluded.role,
      verifier = excluded.verifier,
      verifier_version = excluded.verifier_version,
      user_snapshot = excluded.user_snapshot,
      last_online_auth_at = excluded.last_online_auth_at,
      pending_server_validation = 0,
      stored_token = excluded.stored_token,
      stored_refresh_token = excluded.stored_refresh_token,
      updated_at = excluded.updated_at`,
    emailNormalized,
    params.role,
    verifier,
    VERIFIER_VERSION,
    JSON.stringify({ ...params.user, role: params.role }),
    now,
    params.token,
    params.refreshToken ?? null,
    now
  );
}

export async function findOfflineCredential(
  email: string
): Promise<OfflineCredentialRecord | null> {
  const database = await getOfflineAuthDb();
  const emailNormalized = normalizeEmail(email);
  const row = await database.getFirstAsync<CredentialRow>(
    'SELECT * FROM offline_auth_credentials WHERE email_normalized = ?',
    emailNormalized
  );
  return row ? rowToRecord(row) : null;
}

export async function verifyOfflineCredential(
  email: string,
  password: string
): Promise<{ record: OfflineCredentialRecord; role: UserRole } | null> {
  const record = await findOfflineCredential(email);
  if (!record) return null;

  const deviceSecret = await getDeviceSecret();
  const { verifyPassword } = await import('@/lib/offline-auth/crypto');

  const ok = await verifyPassword(
    deviceSecret,
    record.role,
    email,
    password,
    record.verifier
  );
  if (!ok) return null;
  return { record, role: record.role };
}

export async function markOfflineCredentialUsed(email: string): Promise<void> {
  const database = await getOfflineAuthDb();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE offline_auth_credentials SET
      last_offline_auth_at = ?,
      pending_server_validation = 1,
      updated_at = ?
    WHERE email_normalized = ?`,
    now,
    now,
    normalizeEmail(email)
  );
}

export async function clearPendingServerValidation(email: string): Promise<void> {
  const database = await getOfflineAuthDb();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE offline_auth_credentials SET
      pending_server_validation = 0,
      updated_at = ?
    WHERE email_normalized = ?`,
    now,
    normalizeEmail(email)
  );
}

export async function deleteOfflineCredential(email: string): Promise<void> {
  const database = await getOfflineAuthDb();
  await database.runAsync(
    'DELETE FROM offline_auth_credentials WHERE email_normalized = ?',
    normalizeEmail(email)
  );
}

export async function clearAllOfflineCredentials(): Promise<void> {
  const database = await getOfflineAuthDb();
  await database.runAsync('DELETE FROM offline_auth_credentials');
}
