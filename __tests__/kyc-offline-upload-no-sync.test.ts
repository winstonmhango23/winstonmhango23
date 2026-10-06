/**
 * Picking a KYC photo must not kick background sync.
 * Run: npx jest __tests__/kyc-offline-upload-no-sync.test.ts
 */

const mockEnqueue = jest.fn(async () => undefined);
const mockTrySync = jest.fn(async () => undefined);
const mockRunSync = jest.fn(async () => ({ synced: 0, failed: 0 }));

jest.mock('@/lib/sync/sync-service', () => ({
  enqueueSync: (...args: unknown[]) => mockEnqueue(...args),
  tryRunSyncIfOnline: (...args: unknown[]) => mockTrySync(...args),
  runSyncIfOnline: (...args: unknown[]) => mockRunSync(...args),
}));

jest.mock('@/lib/account-scope', () => ({
  scopedGetItemOptional: jest.fn(async () => null),
  scopedRemoveItem: jest.fn(async () => undefined),
  scopedSetItem: jest.fn(async () => undefined),
}));

import { enqueueKycDocumentUpload } from '@/lib/client-portal/kyc-offline-upload';

describe('enqueueKycDocumentUpload', () => {
  it('queues the file without starting a sync cycle', async () => {
    await enqueueKycDocumentUpload(
      'id_document_path',
      'file:///offline-media/id.jpg',
      'id.jpg'
    );
    expect(mockEnqueue).toHaveBeenCalledWith(
      'CREATE_KYC_UPLOAD',
      'kyc',
      'id_document_path',
      expect.objectContaining({ local_uri: 'file:///offline-media/id.jpg' })
    );
    expect(mockTrySync).not.toHaveBeenCalled();
    expect(mockRunSync).not.toHaveBeenCalled();
  });
});
