/**
 * Login network gate + signInWithOfflineSupport online-first behaviour.
 * Run: npx jest __tests__/auth-service-login.test.ts
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockSetAuth = jest.fn(async () => undefined);
const mockSetState = jest.fn();
const mockUpsertOfflineCredential = jest.fn(async () => undefined);
const mockVerifyOfflineCredential = jest.fn(async () => null as unknown);
const mockMarkOfflineCredentialUsed = jest.fn(async () => undefined);
const mockForceRefresh = jest.fn(async () => true);
const mockHasDataLink = jest.fn(async () => false);
const mockGetIsOnline = jest.fn(async () => false);

jest.mock('@/store/auth', () => ({
  useAuthStore: {
    setState: (...args: unknown[]) => mockSetState(...args),
    getState: () => ({
      setAuth: mockSetAuth,
    }),
  },
}));

jest.mock('@/lib/offline-auth/credential-store', () => ({
  upsertOfflineCredential: (...args: unknown[]) => mockUpsertOfflineCredential(...args),
  verifyOfflineCredential: (...args: unknown[]) => mockVerifyOfflineCredential(...args),
  markOfflineCredentialUsed: (...args: unknown[]) => mockMarkOfflineCredentialUsed(...args),
}));

jest.mock('@/lib/network-manager', () => ({
  networkManager: {
    forceRefresh: (...args: unknown[]) => mockForceRefresh(...args),
    hasDataLink: (...args: unknown[]) => mockHasDataLink(...args),
    getIsOnline: (...args: unknown[]) => mockGetIsOnline(...args),
  },
}));

jest.mock('@/lib/config', () => ({
  config: {
    clientAuth: { login: 'https://api.test/client/client-auth/token' },
    staffAuth: {
      login: 'https://api.test/auth/token',
      me: 'https://api.test/auth/me',
    },
    customer: { dashboard: 'https://api.test/customer/dashboard' },
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/network-retry', () => ({
  LOGIN_MAX_ATTEMPTS: 5,
  retryNetworkOperation: async <T,>(fn: () => Promise<T>) => fn(),
}));

import { signInWithOfflineSupport } from '@/lib/offline-auth/auth-service';
import { shouldAllowOfflineLoginFallback } from '@/lib/offline-auth/login-network-gate';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k === 'content-type' ? 'application/json' : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('shouldAllowOfflineLoginFallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockForceRefresh.mockResolvedValue(true);
    mockHasDataLink.mockResolvedValue(false);
    mockGetIsOnline.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('blocks offline when OS reports a data link', async () => {
    mockHasDataLink.mockResolvedValue(true);
    const pending = shouldAllowOfflineLoginFallback();
    await jest.runAllTimersAsync();
    await expect(pending).resolves.toBe(false);
    expect(mockGetIsOnline).not.toHaveBeenCalled();
  });

  it('blocks offline when API probe succeeds even without OS link', async () => {
    mockHasDataLink.mockResolvedValue(false);
    mockGetIsOnline.mockResolvedValue(true);
    const pending = shouldAllowOfflineLoginFallback();
    await jest.runAllTimersAsync();
    await expect(pending).resolves.toBe(false);
  });

  it('allows offline only after repeated unavailable checks', async () => {
    mockHasDataLink.mockResolvedValue(false);
    mockGetIsOnline.mockResolvedValue(false);
    const pending = shouldAllowOfflineLoginFallback();
    await jest.runAllTimersAsync();
    await expect(pending).resolves.toBe(true);
    expect(mockForceRefresh).toHaveBeenCalledTimes(5);
  });
});

describe('signInWithOfflineSupport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    global.fetch = jest.fn() as unknown as typeof fetch;
    mockForceRefresh.mockResolvedValue(true);
    mockHasDataLink.mockResolvedValue(false);
    mockGetIsOnline.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function runSignIn(email: string, password: string) {
    const pending = signInWithOfflineSupport(email, password);
    await jest.runAllTimersAsync();
    return pending;
  }

  it('attempts online staff login even when offline cache is empty', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/client/client-auth/token')) {
        return jsonResponse({ detail: 'Invalid credentials' }, 401);
      }
      if (url.includes('/auth/token')) {
        return jsonResponse({
          access_token: 'staff-jwt',
          refresh_token: 'staff-refresh',
          user: { full_name: 'Loan Officer' },
        });
      }
      if (url.includes('/auth/me')) {
        return jsonResponse({
          id: 42,
          email: 'officer@cofi.mw',
          full_name: 'Loan Officer',
          branch_id: 3,
        });
      }
      throw new Error('unexpected fetch');
    });

    const result = await runSignIn('officer@cofi.mw', 'correct-pass');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.role).toBe('staff');
      expect(result.mode).toBe('online');
    }
    expect(mockVerifyOfflineCredential).not.toHaveBeenCalled();
    expect(mockSetAuth).toHaveBeenCalled();
    expect(mockUpsertOfflineCredential).toHaveBeenCalled();
  });

  it('still tries staff when client endpoint has a transport failure', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/client/client-auth/token')) {
        throw new Error('Network request failed');
      }
      if (url.includes('/auth/token')) {
        return jsonResponse({
          access_token: 'staff-jwt',
          refresh_token: 'staff-refresh',
        });
      }
      if (url.includes('/auth/me')) {
        return jsonResponse({
          id: 7,
          email: 'officer@cofi.mw',
          full_name: 'Loan Officer',
        });
      }
      throw new Error('unexpected fetch');
    });

    const result = await runSignIn('officer@cofi.mw', 'correct-pass');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.role).toBe('staff');
      expect(result.mode).toBe('online');
    }
    expect(mockVerifyOfflineCredential).not.toHaveBeenCalled();
  });

  it('uses canonical client JSON token endpoint for borrower login', async () => {
    const urls: string[] = [];
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      urls.push(url);
      if (url.includes('/client/client-auth/token')) {
        return jsonResponse({
          access_token: 'client-jwt',
          refresh_token: 'client-refresh',
        });
      }
      if (url.includes('/customer/dashboard')) {
        return jsonResponse({
          client_info: { id: 9, email: 'borrower@cofi.mw', full_name: 'Borrower' },
        });
      }
      throw new Error('unexpected fetch');
    });

    const result = await runSignIn('borrower@cofi.mw', 'correct-pass');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.role).toBe('client');
      expect(result.mode).toBe('online');
    }
    expect(urls[0]).toContain('/client/client-auth/token');
    expect(urls.some((u) => u.includes('/auth/token'))).toBe(false);
  });

  it('signs a client in online when the client endpoint answers with client-ID copy for staff', async () => {
    // Live API answers the client endpoint with "Incorrect client ID or password".
    // That must read as a generic rejection so the staff endpoint still gets asked.
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/client/client-auth/token')) {
        return jsonResponse({ detail: 'Incorrect client ID or password' }, 401);
      }
      if (url.includes('/auth/token')) {
        return jsonResponse({ access_token: 'staff-jwt', refresh_token: 'staff-refresh' });
      }
      if (url.includes('/auth/me')) {
        return jsonResponse({ id: 11, email: 'officer@cofi.mw', full_name: 'Loan Officer' });
      }
      throw new Error('unexpected fetch');
    });

    const result = await runSignIn('officer@cofi.mw', 'correct-pass');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.role).toBe('staff');
      expect(result.mode).toBe('online');
    }
    expect(mockVerifyOfflineCredential).not.toHaveBeenCalled();
  });

  it('signs a borrower in online when they type a client ID', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/client/client-auth/token')) {
        return jsonResponse({ access_token: 'client-jwt', refresh_token: 'client-refresh' });
      }
      if (url.includes('/customer/dashboard')) {
        return jsonResponse({ client_info: { id: 5, client_id: 'CLI-7F2A', full_name: 'Borrower' } });
      }
      throw new Error('unexpected fetch');
    });

    const result = await runSignIn('CLI-7F2A', 'correct-pass');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.role).toBe('client');
      expect(result.mode).toBe('online');
    }
    expect(mockVerifyOfflineCredential).not.toHaveBeenCalled();
  });

  it('returns invalid credentials when both client and staff reject online', async () => {
    (global.fetch as jest.Mock).mockImplementation(async () =>
      jsonResponse({ detail: 'Invalid credentials' }, 401)
    );

    const result = await runSignIn('user@cofi.mw', 'wrong');

    expect(result).toEqual({
      success: false,
      error: 'Incorrect client ID / email or password. Please try again.',
      code: 'invalid_credentials',
    });
    expect(mockVerifyOfflineCredential).not.toHaveBeenCalled();
  });

  it('surfaces non-credential 401 detail instead of generic wrong-password', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/client/client-auth/token')) {
        return jsonResponse({ detail: 'Client not verified' }, 401);
      }
      if (url.includes('/auth/token')) {
        return jsonResponse({ detail: 'Incorrect email or password' }, 401);
      }
      throw new Error('unexpected fetch');
    });

    const result = await runSignIn('borrower@cofi.mw', 'correct-pass');

    expect(result).toEqual({
      success: false,
      error: 'Client not verified',
      code: 'server',
    });
  });

  it('does not offline fallback when network link is present despite fetch failures', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    mockHasDataLink.mockResolvedValue(true);

    const result = await runSignIn('user@cofi.mw', 'cached-pass');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('network');
      expect(result.error).toMatch(/connection looks available/i);
    }
    expect(mockVerifyOfflineCredential).not.toHaveBeenCalled();
  });

  it('falls back to offline only when network checks confirm unavailable', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    mockHasDataLink.mockResolvedValue(false);
    mockGetIsOnline.mockResolvedValue(false);

    mockVerifyOfflineCredential.mockResolvedValue({
      record: {
        lastOnlineAuthAt: new Date().toISOString(),
        storedToken: 'cached-jwt',
        storedRefreshToken: 'cached-refresh',
        userSnapshot: { id: 1, email: 'user@cofi.mw', fullName: 'User', role: 'staff' },
      },
      role: 'staff',
    });

    const result = await runSignIn('user@cofi.mw', 'cached-pass');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.mode).toBe('offline');
    }
    expect(mockVerifyOfflineCredential).toHaveBeenCalledWith('user@cofi.mw', 'cached-pass');
    expect(mockMarkOfflineCredentialUsed).toHaveBeenCalled();
  });

  it('shows network message when offline fallback is allowed but cache misses', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));
    mockVerifyOfflineCredential.mockResolvedValue(null);

    const result = await runSignIn('user@cofi.mw', 'any-pass');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('network');
      expect(result.error).toMatch(/Unable to reach the sign-in server/i);
    }
  });

  it('surfaces server errors (e.g. device blocked) without offline fallback', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/client/client-auth/token')) {
        return jsonResponse({ detail: 'Invalid credentials' }, 401);
      }
      if (url.includes('/auth/token')) {
        return jsonResponse({ detail: 'Device not registered for mobile access' }, 403);
      }
      throw new Error('unexpected fetch');
    });

    const result = await runSignIn('officer@cofi.mw', 'pass');

    expect(result).toEqual({
      success: false,
      error: 'Device not registered for mobile access',
      code: 'server',
    });
    expect(mockVerifyOfflineCredential).not.toHaveBeenCalled();
  });

  it('treats mixed 401 + transport failure as network (not wrong password)', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/client/client-auth/token')) {
        return jsonResponse({ detail: 'Incorrect email or password' }, 401);
      }
      if (url.includes('/auth/token')) {
        throw new Error('Network request timed out');
      }
      throw new Error('unexpected fetch');
    });
    mockHasDataLink.mockResolvedValue(true);

    const result = await runSignIn('officer@cofi.mw', 'correct-pass');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('network');
      expect(result.error).not.toMatch(/Incorrect email or password/i);
    }
    expect(mockVerifyOfflineCredential).not.toHaveBeenCalled();
  });
});
