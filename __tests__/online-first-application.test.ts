/**
 * Online-first loan application create path.
 * Run: npx jest __tests__/online-first-application.test.ts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockForceRefresh = jest.fn(async () => true);
const mockHasDataLink = jest.fn(async () => true);
const mockSqliteCreate = jest.fn();
const mockSqliteCache = jest.fn();
const mockSqliteGet = jest.fn();
const mockEnqueue = jest.fn(async () => undefined);
const mockRunSync = jest.fn(async () => ({ synced: 0, failed: 0 }));
const mockPush = jest.fn();
const mockValidate = jest.fn(async () => undefined);
const mockGetToken = jest.fn(async () => 'tok');

jest.mock('@/lib/network-manager', () => ({
  networkManager: {
    forceRefresh: (...args: unknown[]) => mockForceRefresh(...args),
    getIsOnline: jest.fn(async () => true),
    getCurrentStatus: jest.fn(() => true),
    hasDataLink: (...args: unknown[]) => mockHasDataLink(...args),
  },
}));

jest.mock('@/lib/data/sqlite', () => ({
  sqliteCreateApplication: (...args: unknown[]) => mockSqliteCreate(...args),
  sqliteCacheSyncedApplication: (...args: unknown[]) => mockSqliteCache(...args),
  sqliteGetApplication: (...args: unknown[]) => mockSqliteGet(...args),
}));

jest.mock('@/lib/sync/sync-service', () => ({
  enqueueSync: (...args: unknown[]) => mockEnqueue(...args),
  runSyncIfOnline: (...args: unknown[]) => mockRunSync(...args),
}));

jest.mock('@/lib/sync/push-application', () => ({
  pushLoanApplicationToRemote: (...args: unknown[]) => mockPush(...args),
}));

jest.mock('@/lib/offline-auth/session-validator', () => ({
  validateAndRefreshSession: (...args: unknown[]) => mockValidate(...args),
}));

jest.mock('@/lib/auth-token', () => ({
  getAuthToken: (...args: unknown[]) => mockGetToken(...args),
}));

jest.mock('@/lib/config-flags', () => ({
  USE_API: true,
}));

jest.mock('@/lib/storage', () => ({
  getStoredAuth: jest.fn(async () => null),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/cache', () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
  isNetworkError: (e: unknown) =>
    e instanceof Error && /network|fetch|timeout/i.test(e.message),
}));

jest.mock('@/lib/network-retry', () => ({
  APPLICATION_CREATE_MAX_ATTEMPTS: 3,
  retryNetworkOperation: async <T,>(
    fn: () => Promise<T>,
    opts?: { maxAttempts?: number }
  ): Promise<T> => {
    const maxAttempts = opts?.maxAttempts ?? 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        const isNet =
          e instanceof Error && /network|fetch|timeout/i.test(e.message);
        if (!isNet) throw e;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('network retries exhausted');
  },
}));

import { createApplication } from '@/lib/data';

describe('createApplication online-first', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockForceRefresh.mockResolvedValue(true);
    mockHasDataLink.mockResolvedValue(true);
    mockPush.mockResolvedValue({
      id: 501,
      application_number: 'APP-ONLINE-1',
      status: 'DRAFT',
      requested_amount: 100000,
      requested_term_months: 12,
      product_name: 'Personal Loan',
      application_date: '2026-07-13',
      created_at: '2026-07-13T00:00:00Z',
      sync_status: 'synced',
    });
    mockSqliteCache.mockImplementation(async (row: unknown) => row);
  });

  it('saves to remote first when online, then caches locally as synced', async () => {
    const row = await createApplication({
      application_number: 'APP-LOCAL',
      status: 'DRAFT',
      requested_amount: 100000,
      requested_term_months: 12,
      product_name: 'Personal Loan',
      application_date: '2026-07-13',
      loan_product_id: 9,
      purpose: 'Working capital',
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockSqliteCache).toHaveBeenCalled();
    expect(mockSqliteCreate).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(row.sync_status).toBe('synced');
    expect(row.id).toBe(501);
  });

  it('falls back to local queue when device has no link', async () => {
    mockForceRefresh.mockResolvedValue(false);
    mockHasDataLink.mockResolvedValue(false);
    mockSqliteCreate.mockResolvedValue({
      id: 7,
      application_number: 'APP-OFF',
      status: 'DRAFT',
      requested_amount: 100000,
      requested_term_months: 12,
      product_name: 'Personal Loan',
      application_date: '2026-07-13',
      created_at: '2026-07-13T00:00:00Z',
      sync_status: 'pending',
    });
    mockSqliteGet.mockResolvedValue(null);

    const row = await createApplication({
      application_number: 'APP-OFF',
      status: 'DRAFT',
      requested_amount: 100000,
      requested_term_months: 12,
      product_name: 'Personal Loan',
      application_date: '2026-07-13',
      loan_product_id: 9,
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSqliteCreate).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith(
      'CREATE_APPLICATION',
      'application',
      7,
      expect.objectContaining({ loan_product_id: 9 })
    );
    expect(row.sync_status).toBe('pending');
  });

  it('retries remote create on network errors before SQLite fallback', async () => {
    mockPush
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce({
        id: 77,
        application_number: 'APP-RETRY',
        status: 'DRAFT',
        requested_amount: 50000,
        requested_term_months: 6,
        product_name: 'Agric Loan',
        application_date: '2026-07-13',
        created_at: '2026-07-13T00:00:00Z',
        sync_status: 'synced',
      });

    const row = await createApplication({
      application_number: 'APP-RETRY',
      status: 'DRAFT',
      requested_amount: 50000,
      requested_term_months: 6,
      product_name: 'Agric Loan',
      application_date: '2026-07-13',
      loan_product_id: 3,
    });

    expect(mockPush).toHaveBeenCalledTimes(3);
    expect(mockSqliteCreate).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(row.id).toBe(77);
    expect(row.sync_status).toBe('synced');
  });

  it('queues offline after exhausting network retries', async () => {
    mockPush.mockRejectedValue(new Error('Network request failed'));
    mockSqliteCreate.mockResolvedValue({
      id: 8,
      application_number: 'APP-BLIP',
      status: 'DRAFT',
      requested_amount: 50000,
      requested_term_months: 6,
      product_name: 'Agric Loan',
      application_date: '2026-07-13',
      created_at: '2026-07-13T00:00:00Z',
      sync_status: 'pending',
    });
    mockSqliteGet.mockResolvedValue(null);

    const row = await createApplication({
      application_number: 'APP-BLIP',
      status: 'DRAFT',
      requested_amount: 50000,
      requested_term_months: 6,
      product_name: 'Agric Loan',
      application_date: '2026-07-13',
      loan_product_id: 3,
    });

    expect(mockPush).toHaveBeenCalledTimes(3);
    expect(mockEnqueue).toHaveBeenCalled();
    expect(mockRunSync).toHaveBeenCalledWith(
      expect.objectContaining({ forceNetworkCheck: true, retryFailed: true })
    );
    expect(row.sync_status).toBe('pending');
  });

  it('still attempts remote when health probe fails but link is up', async () => {
    mockForceRefresh.mockResolvedValue(false);
    mockHasDataLink.mockResolvedValue(true);

    const row = await createApplication({
      application_number: 'APP-PROBE',
      status: 'DRAFT',
      requested_amount: 100000,
      requested_term_months: 12,
      product_name: 'Personal Loan',
      application_date: '2026-07-13',
      loan_product_id: 9,
    });

    expect(mockPush).toHaveBeenCalled();
    expect(mockSqliteCreate).not.toHaveBeenCalled();
    expect(row.sync_status).toBe('synced');
  });

  it('surfaces non-network API errors instead of silent offline save', async () => {
    mockPush.mockRejectedValue(new Error('loan_product_id: Invalid product'));

    await expect(
      createApplication({
        application_number: 'APP-BAD',
        status: 'DRAFT',
        requested_amount: 1000,
        requested_term_months: 12,
        product_name: 'Personal Loan',
        application_date: '2026-07-13',
        loan_product_id: 999,
      })
    ).rejects.toThrow(/Invalid product/);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockSqliteCreate).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
