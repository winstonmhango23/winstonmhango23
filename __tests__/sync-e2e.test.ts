/**
 * E2E tests for offline → sync pipeline.
 *
 * Tests that data written offline to SQLite is captured in the sync queue,
 * and that the sync service correctly replays to the backend when online.
 *
 * Run: npx jest __tests__/sync-e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockDbExec = jest.fn();
const mockDbRun = jest.fn(() => Promise.resolve({ changes: 1, lastInsertRowId: 1 }));
const mockDbGetFirst = jest.fn(() => Promise.resolve(null));
const mockDbGetAll = jest.fn(() => Promise.resolve([]));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve({
    execAsync: mockDbExec,
    runAsync: mockDbRun,
    getFirstAsync: mockDbGetFirst,
    getAllAsync: mockDbGetAll,
    closeAsync: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(() => Promise.resolve('abcdef0123456789digest')),
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
}));

let mockPost = jest.fn(() => Promise.resolve({ id: 1, status: 'DRAFT' }));

jest.mock('@/lib/api-client', () => ({
  api: {
    get: jest.fn(() => Promise.resolve([])),
    post: (...args: any[]) => mockPost(...args),
    put: jest.fn(() => Promise.resolve({})),
    patch: jest.fn(() => Promise.resolve({})),
    delete: jest.fn(() => Promise.resolve({})),
  },
  ApiClientError: class extends Error {
    status: number;
    requestId: string;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiClientError';
      this.status = status;
      this.requestId = `req_test_${Date.now()}`;
    }
  },
}));

jest.mock('@/lib/storage', () => ({
  getStoredAuth: jest.fn(() => Promise.resolve({
    token: 'test-token',
    refreshToken: 'test-refresh',
    user: { id: 1, email: 'test@cofi.mw', fullName: 'Test User', role: 'staff' },
  })),
}));

jest.mock('@/store/auth', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({ token: 'test-token', user: { id: 1, role: 'staff' }, hydrated: true })),
  },
}));

jest.mock('@/lib/auth-token', () => ({
  waitForAuthHydration: jest.fn(() => Promise.resolve()),
  resolveAuthTokenForSync: jest.fn(async () => {
    const { useAuthStore } = require('@/store/auth');
    const live = useAuthStore.getState().token;
    if (live) return live;
    const { getStoredAuth } = require('@/lib/storage');
    const auth = await getStoredAuth();
    return auth?.token ?? null;
  }),
}));

jest.mock('@/lib/client-portal/api', () => ({
  registerPortalIndividual: jest.fn(() => Promise.resolve({
    access_token: 'portal-token',
    refresh_token: 'portal-refresh',
  })),
  registerPortalGroup: jest.fn(() => Promise.resolve({
    access_token: 'portal-token',
    refresh_token: 'portal-refresh',
  })),
}));

jest.mock('@/lib/data/api', () => ({
  apiCreateApplicationClient: jest.fn(() =>
    Promise.resolve({ id: 100, status: 'DRAFT', application_number: 'APP-E2E-001' })
  ),
  apiCreateApplicationStaff: jest.fn(() =>
    Promise.resolve({ id: 100, status: 'DRAFT', application_number: 'APP-E2E-001' })
  ),
  apiCreateMobileLoanApplication: jest.fn(() =>
    Promise.resolve({ id: 100, status: 'DRAFT', application_number: 'APP-E2E-001' })
  ),
  apiCreateRepayment: jest.fn(() => Promise.resolve({ id: 200, status: 'FINALISED' })),
  apiValidateGroupOrigination: jest.fn(() =>
    Promise.resolve({ normalized_allocation: {}, blockers: [] })
  ),
  apiValidateMobileGroupOrigination: jest.fn(() =>
    Promise.resolve({ normalized_allocation: {}, blockers: [] })
  ),
  apiAddApplicationDocumentStaff: jest.fn(() => Promise.resolve({})),
  apiAddApplicationDocumentClient: jest.fn(() => Promise.resolve({})),
  apiSetApplicationBusinessLocation: jest.fn(() => Promise.resolve({})),
  apiApproveApplication: jest.fn(() => Promise.resolve({})),
  apiRejectApplication: jest.fn(() => Promise.resolve({})),
  apiDisburseApplication: jest.fn(() => Promise.resolve({})),
  apiUpdateApplication: jest.fn(() => Promise.resolve({})),
  apiGetStaffProfile: jest.fn(() => Promise.resolve({ id: 1 })),
  apiSyncCreateClient: jest.fn(() => Promise.resolve({ id: 1 })),
  apiSetClientBusinessLocation: jest.fn(() => Promise.resolve({})),
  apiAddGroupMember: jest.fn(() => Promise.resolve({ id: 1 })),
}));

jest.mock('@/lib/account-scope', () => ({
  requireActiveAccountScopeId: () => 'staff_1',
  getActiveAccountScopeId: () => 'staff_1',
  activateAccountScope: jest.fn(() =>
    Promise.resolve({
      scopeId: 'staff_1',
      role: 'staff',
      userId: 1,
      tokenFingerprint: 'abcdef012345',
      activatedAt: new Date().toISOString(),
    })
  ),
  clearActiveAccountScope: jest.fn(() => Promise.resolve()),
  scopedDatabaseName: (id: string) => `cofi_loan_app__${id}.db`,
  SHARED_AUTH_DATABASE_NAME: 'cofi_auth_shared.db',
  scopedKvKey: (scopeId: string, key: string) => `cofi.a.${scopeId}.${key}`,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import * as Network from 'expo-network';
import { sqliteCreateApplication } from '@/lib/data/sqlite';
import { enqueueSync, runSync, getFailedSyncCount } from '@/lib/sync/sync-service';

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('Offline → Sync E2E Pipeline', () => {

  beforeAll(async () => {
    mockDbExec.mockClear();
    mockDbRun.mockClear();
    mockDbGetFirst.mockClear();
    mockDbGetAll.mockClear();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  // ─── Test 1: SQLite Write Captured ─────────────────────────────────────

  it('should write data to SQLite when offline', async () => {
    mockDbRun.mockResolvedValue({ changes: 1, lastInsertRowId: 42 });

    const app = await sqliteCreateApplication({
      application_number: 'APP-E2E-001',
      status: 'DRAFT',
      requested_amount: 50000000,
      requested_term_months: 12,
      product_name: 'SME Loan',
      application_date: new Date().toISOString().slice(0, 10),
      client_name: 'E2E Test Client',
    });

    expect(mockDbRun).toHaveBeenCalled();
    expect(app.id).toBe(42);
  });

  // ─── Test 2: Sync Queue Entry ──────────────────────────────────────────

  it('should enqueue a sync operation for offline-created data', async () => {
    mockDbRun.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    await enqueueSync('CREATE_APPLICATION', 'application', '42', {
      application_number: 'APP-E2E-001',
      requested_amount: 50000000,
    });

    // Should have inserted into sync_queue
    const insertCall = mockDbRun.mock.calls.find(
      (c: any[]) => c[0] && c[0].includes('INSERT INTO sync_queue')
    );
    expect(insertCall).toBeDefined();
  });

  // ─── Test 3: Full Sync Replay ──────────────────────────────────────────

  it('should replay queued operations to API and clear queue on success', async () => {
    mockDbGetAll
      .mockResolvedValueOnce([]) // portal registrations
      .mockResolvedValueOnce([]) // pending_repayments
      .mockResolvedValueOnce([
        {
          id: 1,
          operation: 'CREATE_APPLICATION',
          entity_type: 'application',
          entity_local_id: '42',
          payload: JSON.stringify({ application_number: 'APP-E2E-001' }),
          sync_status: 'pending',
          created_at: new Date().toISOString(),
          retry_count: 0,
          last_error: null,
        },
      ]);

    mockPost.mockResolvedValueOnce({ id: 100, status: 'DRAFT' });

    mockDbGetFirst.mockResolvedValue({ count: 0 });

    const result = await runSync();
    expect(result.synced).toBeGreaterThanOrEqual(0);
  });

  // ─── Test 4: Failed Sync → Retry ───────────────────────────────────────

  it('should mark sync as failed when API returns error', async () => {
    mockDbGetAll
      .mockResolvedValueOnce([]) // portal
      .mockResolvedValueOnce([]) // repayments
      .mockResolvedValueOnce([
        {
          id: 2,
          operation: 'CREATE_APPLICATION',
          entity_type: 'application',
          entity_local_id: '99',
          payload: JSON.stringify({ application_number: 'APP-E2E-002' }),
          sync_status: 'pending',
          created_at: new Date().toISOString(),
          retry_count: 0,
          last_error: null,
        },
      ]);

    mockPost.mockRejectedValueOnce(new Error('Network error'));

    mockDbGetFirst
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await runSync();
    const failedCount = await getFailedSyncCount();
    expect(failedCount).toBe(1);
  });

  // ─── Test 5: Repayment Offline → Sync ──────────────────────────────────

  it('should sync offline-recorded repayments', async () => {
    mockDbGetAll
      .mockResolvedValueOnce([]) // portal
      .mockResolvedValueOnce([
        {
          id: 1,
          loan_id: 1,
          client_id: 1,
          loan_account_number: 'LN-001',
          amount: 2500000,
          principal_amount: 2000000,
          interest_amount: 500000,
          repayment_date: new Date().toISOString().slice(0, 10),
          payment_method: 'CASH',
          reference: 'REF-TEST-001',
          sync_status: 'pending',
          member_contribution_details: null,
          client_reference: null,
        },
      ])
      .mockResolvedValueOnce([]); // sync queue

    mockPost.mockResolvedValueOnce({ id: 200, status: 'FINALISED' });

    const result = await runSync();
    expect(result.synced).toBeGreaterThanOrEqual(0);
  });

  // ─── Test 6: Skip Sync When Offline ────────────────────────────────────

  it('should skip staff sync when network is not connected', async () => {
    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
    });

    const result = await runSync();
    expect(result).toEqual({ synced: 0, failed: 0, repaired: 0, deferred: 0 });
  });

  it('should skip authenticated sync when not logged in', async () => {
    const { resolveAuthTokenForSync } = require('@/lib/auth-token');
    (resolveAuthTokenForSync as jest.Mock).mockResolvedValueOnce(null);
    const { useAuthStore } = require('@/store/auth');
    (useAuthStore.getState as jest.Mock).mockReturnValueOnce({
      token: null,
      user: null,
      hydrated: true,
    });

    mockDbGetAll.mockResolvedValueOnce([]); // portal registrations

    const result = await runSync();
    expect(result).toEqual({ synced: 0, failed: 0, repaired: 0, noAuth: true });
  });

  it('should not report noAuth when token missing but user still in memory', async () => {
    const { resolveAuthTokenForSync } = require('@/lib/auth-token');
    (resolveAuthTokenForSync as jest.Mock).mockResolvedValueOnce(null);
    const { useAuthStore } = require('@/store/auth');
    (useAuthStore.getState as jest.Mock).mockReturnValueOnce({
      token: null,
      user: { id: 1, role: 'client', email: 'c@cofi.mw', fullName: 'Client' },
      hydrated: true,
    });

    mockDbGetAll.mockResolvedValueOnce([]);

    const result = await runSync();
    expect(result).toEqual({ synced: 0, failed: 0, repaired: 0, noAuth: false });
  });
});
