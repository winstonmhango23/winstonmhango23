import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockDbRun = jest.fn(() => Promise.resolve({ changes: 1, lastInsertRowId: 1 }));
const mockDbGetFirst = jest.fn(() => Promise.resolve(null));
const mockDbGetAll = jest.fn(() => Promise.resolve([]));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() =>
    Promise.resolve({
      execAsync: jest.fn(),
      runAsync: mockDbRun,
      getFirstAsync: mockDbGetFirst,
      getAllAsync: mockDbGetAll,
      closeAsync: jest.fn(() => Promise.resolve()),
    })
  ),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(() => Promise.resolve('abcdef0123456789digest')),
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(() =>
    Promise.resolve({ isConnected: false, isInternetReachable: false })
  ),
}));

jest.mock('@/lib/storage', () => ({
  getStoredAuth: jest.fn(() =>
    Promise.resolve({
      token: 'test-token',
      user: { id: 1, role: 'staff' },
    })
  ),
}));

jest.mock('@/lib/client-portal/api', () => ({
  registerPortalIndividual: jest.fn(),
  registerPortalGroup: jest.fn(),
  uploadMobileKycDocument: jest.fn(() => Promise.resolve({ path: '/uploads/kyc.jpg' })),
}));

jest.mock('@/lib/client-portal/kyc-offline-upload', () => ({
  storeKycUploadResult: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/data/api', () => ({
  apiCreateRepayment: jest.fn(() => Promise.resolve({ id: 1 })),
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

import {
  retrySyncItem,
  discardSyncItem,
  getPendingApplicationGroupAllocation,
} from '@/lib/sync/sync-service';

describe('sync item actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retrySyncItem resets queue row to pending', async () => {
    await retrySyncItem({
      id: 5,
      kind: 'queue',
      operation: 'CREATE_CLIENT',
      label: 'client',
      status: 'failed',
      createdAt: '',
      lastError: 'err',
      entityLocalId: 'local-1',
    });
    expect(mockDbRun).toHaveBeenCalledWith(
      "UPDATE sync_queue SET sync_status = 'pending', last_error = NULL WHERE id = ?",
      5
    );
  });

  it('retrySyncItem resets repayment row to pending', async () => {
    await retrySyncItem({
      id: 9,
      kind: 'repayment',
      operation: 'CREATE_REPAYMENT',
      label: 'repayment',
      status: 'failed',
      createdAt: '',
      lastError: null,
      entityLocalId: '9',
    });
    expect(mockDbRun).toHaveBeenCalledWith(
      "UPDATE pending_repayments SET sync_status = 'pending' WHERE id = ?",
      9
    );
  });

  it('discardSyncItem deletes queue row and marks application failed', async () => {
    await discardSyncItem({
      id: 3,
      kind: 'queue',
      operation: 'CREATE_APPLICATION',
      label: 'app',
      status: 'conflict',
      createdAt: '',
      lastError: 'dup',
      entityLocalId: '12',
    });
    expect(mockDbRun).toHaveBeenCalledWith('DELETE FROM sync_queue WHERE id = ?', 3);
    expect(mockDbRun).toHaveBeenCalledWith(
      "UPDATE applications SET sync_status = 'failed' WHERE id = ?",
      '12'
    );
  });

  it('discardSyncItem deletes pending repayment', async () => {
    await discardSyncItem({
      id: 7,
      kind: 'repayment',
      operation: 'CREATE_REPAYMENT',
      label: 'repayment',
      status: 'pending',
      createdAt: '',
      lastError: null,
      entityLocalId: '7',
    });
    expect(mockDbRun).toHaveBeenCalledWith('DELETE FROM pending_repayments WHERE id = ?', 7);
  });

  it('getPendingApplicationGroupAllocation reads payload from sync queue', async () => {
    mockDbGetFirst.mockResolvedValueOnce({
      payload: JSON.stringify({
        group_loan_allocation: { mode: 'equal', member_client_ids: [1, 2] },
      }),
    });
    const result = await getPendingApplicationGroupAllocation(42);
    expect(result).toEqual({ mode: 'equal', member_client_ids: [1, 2] });
  });
});
