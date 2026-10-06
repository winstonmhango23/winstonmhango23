/**
 * Account-scoped local storage — prevents cross-account data leakage on shared devices.
 */

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_algo: string, data: string) => {
    // Deterministic fake digest for tests
    let h = 0;
    for (let i = 0; i < data.length; i++) h = (h * 31 + data.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(12, '0') + 'abcdef0123456789';
  }),
}));

import {
  buildAccountScopeId,
  fingerprintAccessToken,
  scopedDatabaseName,
  scopedKvKey,
} from '@/lib/account-scope/ids';

describe('account scope ids', () => {
  it('builds stable role_userId scope ids', () => {
    expect(buildAccountScopeId({ role: 'staff', id: 42 })).toBe('staff_42');
    expect(buildAccountScopeId({ role: 'client', id: 7 })).toBe('client_7');
  });

  it('rejects invalid user ids', () => {
    expect(() => buildAccountScopeId({ role: 'client', id: 0 })).toThrow(/positive user id/);
    expect(() => buildAccountScopeId({ role: 'staff', id: -1 })).toThrow(/positive user id/);
  });

  it('prefixes KV keys with account namespace', () => {
    expect(scopedKvKey('staff_42', 'cache_loans')).toBe('cofi.a.staff_42.cache_loans');
  });

  it('names per-account sqlite files distinctly', () => {
    expect(scopedDatabaseName('staff_42')).toBe('cofi_loan_app__staff_42.db');
    expect(scopedDatabaseName('client_7')).toBe('cofi_loan_app__client_7.db');
    expect(scopedDatabaseName('staff_42')).not.toBe(scopedDatabaseName('client_7'));
  });

  it('fingerprints access tokens without using the raw JWT as a key', async () => {
    const fp1 = await fingerprintAccessToken('token-aaa');
    const fp2 = await fingerprintAccessToken('token-bbb');
    const fp1b = await fingerprintAccessToken('token-aaa');
    expect(fp1).toHaveLength(12);
    expect(fp1).toBe(fp1b);
    expect(fp1).not.toBe(fp2);
    expect(fp1).not.toContain('token-aaa');
  });
});
