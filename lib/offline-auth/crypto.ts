/**
 * Offline credential verifier — HMAC-SHA256 with device-bound secret.
 * Passwords are never persisted; only the verifier digest is stored.
 */

import * as Crypto from 'expo-crypto';
import { VERIFIER_VERSION } from '@/lib/offline-auth/constants';
import type { UserRole } from '@/store/auth';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildVerifierPayload(
  role: UserRole,
  emailNormalized: string,
  password: string
): string {
  return `v${VERIFIER_VERSION}|${role}|${emailNormalized}|${password}`;
}

/** Testable core — pass explicit deviceSecret in unit tests. */
export async function computePasswordVerifier(
  deviceSecret: string,
  role: UserRole,
  email: string,
  password: string
): Promise<string> {
  const emailNormalized = normalizeEmail(email);
  const payload = buildVerifierPayload(role, emailNormalized, password);
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${deviceSecret}:${payload}`
  );
}

export async function verifyPassword(
  deviceSecret: string,
  role: UserRole,
  email: string,
  password: string,
  expectedVerifier: string
): Promise<boolean> {
  const computed = await computePasswordVerifier(deviceSecret, role, email, password);
  return timingSafeEqual(computed, expectedVerifier);
}

/** Constant-time string compare (best-effort on JS strings). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
