/**
 * Offline auth unit tests — credential verifier, session expiry, banner state.
 * Run: pnpm test __tests__/offline-auth.test.ts
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn((_alg: string, input: string) =>
    Promise.resolve(`mock-digest:${input}`)
  ),
  getRandomBytesAsync: jest.fn(() => Promise.resolve(new Uint8Array(32).fill(7))),
}));

import {
  computePasswordVerifier,
  normalizeEmail,
  timingSafeEqual,
  verifyPassword,
} from '@/lib/offline-auth/crypto';
import { OFFLINE_SESSION_MAX_DAYS } from '@/lib/offline-auth/constants';
import { resolveOfflineAuthBannerState } from '@/lib/offline-auth/banner-state';
import {
  isOfflineSessionExpired,
  parseSessionMetadata,
} from '@/lib/offline-auth/session-validator';

describe('offline-auth crypto', () => {
  const deviceSecret = 'test-device-secret';

  it('normalizes email to lowercase trimmed', () => {
    expect(normalizeEmail('  User@CoFi.MW  ')).toBe('user@cofi.mw');
  });

  it('computes stable verifier for same inputs', async () => {
    const a = await computePasswordVerifier(deviceSecret, 'staff', 'a@b.com', 'secret');
    const b = await computePasswordVerifier(deviceSecret, 'staff', 'a@b.com', 'secret');
    expect(a).toBe(b);
    expect(a).toContain('mock-digest:');
  });

  it('differs when password or role changes', async () => {
    const base = await computePasswordVerifier(deviceSecret, 'staff', 'a@b.com', 'secret');
    const wrongPass = await computePasswordVerifier(deviceSecret, 'staff', 'a@b.com', 'other');
    const wrongRole = await computePasswordVerifier(deviceSecret, 'client', 'a@b.com', 'secret');
    expect(wrongPass).not.toBe(base);
    expect(wrongRole).not.toBe(base);
  });

  it('verifyPassword accepts matching verifier', async () => {
    const verifier = await computePasswordVerifier(deviceSecret, 'client', 'x@y.z', 'pw');
    const ok = await verifyPassword(deviceSecret, 'client', 'x@y.z', 'pw', verifier);
    expect(ok).toBe(true);
  });

  it('verifyPassword rejects wrong password', async () => {
    const verifier = await computePasswordVerifier(deviceSecret, 'client', 'x@y.z', 'pw');
    const ok = await verifyPassword(deviceSecret, 'client', 'x@y.z', 'bad', verifier);
    expect(ok).toBe(false);
  });

  it('timingSafeEqual compares strings in constant length', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('ab', 'abc')).toBe(false);
  });
});

describe('session metadata and expiry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-12T10:00:00.000Z'));
  });

  it('parseSessionMetadata defaults to online when fields missing', () => {
    expect(parseSessionMetadata(null)).toEqual({
      sessionMode: 'online',
      lastOnlineValidatedAt: null,
      pendingServerValidation: false,
    });
  });

  it('parseSessionMetadata reads stored offline flags', () => {
    expect(
      parseSessionMetadata({
        token: 't',
        user: { id: 1, email: 'a@b.com', role: 'staff' },
        sessionMode: 'offline',
        lastOnlineValidatedAt: '2026-07-01T00:00:00.000Z',
        pendingServerValidation: true,
      })
    ).toEqual({
      sessionMode: 'offline',
      lastOnlineValidatedAt: '2026-07-01T00:00:00.000Z',
      pendingServerValidation: true,
    });
  });

  it('isOfflineSessionExpired is false within max window', () => {
    const recent = new Date('2026-07-10T10:00:00.000Z').toISOString();
    expect(isOfflineSessionExpired(recent)).toBe(false);
  });

  it('isOfflineSessionExpired is true after max window', () => {
    const old = new Date(
      Date.now() - (OFFLINE_SESSION_MAX_DAYS + 1) * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(isOfflineSessionExpired(old)).toBe(true);
  });

  it('isOfflineSessionExpired treats null as expired', () => {
    expect(isOfflineSessionExpired(null)).toBe(true);
  });
});

describe('OfflineAuthBanner state', () => {
  it('hidden when no token', () => {
    expect(
      resolveOfflineAuthBannerState({
        token: null,
        sessionMode: 'offline',
        pendingServerValidation: true,
        isConnected: false,
      })
    ).toEqual({ visible: false });
  });

  it('hidden for online session without pending validation', () => {
    expect(
      resolveOfflineAuthBannerState({
        token: 'jwt',
        sessionMode: 'online',
        pendingServerValidation: false,
        isConnected: true,
      })
    ).toEqual({ visible: false });
  });

  it('shows offline copy when disconnected', () => {
    expect(
      resolveOfflineAuthBannerState({
        token: 'jwt',
        sessionMode: 'offline',
        pendingServerValidation: true,
        isConnected: false,
      })
    ).toEqual({
      visible: true,
      message: 'Offline session — sign-in will be verified when you reconnect.',
      icon: 'lock-clock',
    });
  });

  it('shows verifying copy when online but pending validation', () => {
    expect(
      resolveOfflineAuthBannerState({
        token: 'jwt',
        sessionMode: 'offline',
        pendingServerValidation: true,
        isConnected: true,
      })
    ).toEqual({
      visible: true,
      message: 'Verifying your session with the server…',
      icon: 'verified-user',
    });
  });

  it('visible when pendingServerValidation alone (online mode)', () => {
    expect(
      resolveOfflineAuthBannerState({
        token: 'jwt',
        sessionMode: 'online',
        pendingServerValidation: true,
        isConnected: true,
      }).visible
    ).toBe(true);
  });
});
