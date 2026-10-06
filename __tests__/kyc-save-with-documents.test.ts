/**
 * KYC documents upload only on Save (online-first, queue if offline).
 * Run: npx jest __tests__/kyc-save-with-documents.test.ts
 */

const mockPersist = jest.fn(async (uri: string) => uri);
const mockCompress = jest.fn(async (uri: string) => ({ uri, name: 'id.jpg' }));
const mockEnqueueUpload = jest.fn(async () => undefined);
const mockQueueSave = jest.fn(async () => undefined);
const mockUpload = jest.fn();
const mockSaveKyc = jest.fn();
const mockRunOnlineFirst = jest.fn();
const mockRunSync = jest.fn(async () => ({ synced: 0, failed: 0 }));
const mockPendingCount = jest.fn(async () => 0);

jest.mock('@/lib/media/offline-media-store', () => ({
  persistOfflineMedia: (...args: unknown[]) => mockPersist(...(args as [string])),
}));

jest.mock('@/lib/media/compress-image', () => ({
  compressImageForUpload: (...args: unknown[]) => mockCompress(...(args as [string])),
}));

jest.mock('@/lib/media/resolve-upload-url', () => ({
  isPdfPath: (path: string | null | undefined) => Boolean(path?.toLowerCase().endsWith('.pdf')),
}));

jest.mock('@/lib/media/authenticated-media', () => ({
  isLocalMediaUri: (uri: string | null | undefined) =>
    Boolean(uri && (uri.startsWith('file://') || uri.startsWith('content://'))),
}));

jest.mock('@/lib/client-portal/kyc-offline-upload', () => ({
  enqueueKycDocumentUpload: (...args: unknown[]) => mockEnqueueUpload(...args),
}));

jest.mock('@/lib/client-portal/kyc-offline-save', () => ({
  queueMobileKycSave: (...args: unknown[]) => mockQueueSave(...args),
}));

jest.mock('@/lib/client-portal/api', () => ({
  uploadMobileKycDocument: (...args: unknown[]) => mockUpload(...args),
  saveMobileKyc: (...args: unknown[]) => mockSaveKyc(...args),
}));

jest.mock('@/lib/online-first-remote', () => ({
  runOnlineFirstRemote: (...args: unknown[]) => mockRunOnlineFirst(...args),
}));

jest.mock('@/lib/sync/sync-service', () => ({
  runSyncIfOnline: (...args: unknown[]) => mockRunSync(...args),
  getPendingSyncCount: (...args: unknown[]) => mockPendingCount(...args),
}));

import { persistKycDocumentsThenSave } from '@/lib/client-portal/kyc-save-with-documents';

const LOCAL_ID = 'file:///data/app/documents/offline-media/id-front.jpg';

describe('persistKycDocumentsThenSave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPersist.mockImplementation(async (uri: string) => uri);
    mockCompress.mockImplementation(async (uri: string) => ({ uri, name: 'id.jpg' }));
  });

  it('uploads local photos and saves KYC when the device has a link', async () => {
    mockRunOnlineFirst.mockImplementation(async (_label: string, fn: () => Promise<unknown>) => {
      const value = await fn();
      return { ok: true, value };
    });
    mockUpload.mockResolvedValue({ path: '/uploads/id-front.jpg' });
    mockSaveKyc.mockResolvedValue({});

    const result = await persistKycDocumentsThenSave(
      'tok',
      { national_id: 'MW1' },
      { id_document_path: LOCAL_ID }
    );

    expect(result).toBe('online');
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockSaveKyc).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ id_document_path: '/uploads/id-front.jpg', national_id: 'MW1' })
    );
    expect(mockEnqueueUpload).not.toHaveBeenCalled();
    expect(mockQueueSave).not.toHaveBeenCalled();
    expect(mockRunSync).not.toHaveBeenCalled();
  });

  it('queues documents and KYC on Save when there is no link, then tries reconnect sync', async () => {
    mockRunOnlineFirst.mockResolvedValue({ ok: false, reason: 'no_link' });
    mockPendingCount.mockResolvedValue(2);

    const result = await persistKycDocumentsThenSave(
      'tok',
      { national_id: 'MW1' },
      { id_document_path: LOCAL_ID }
    );

    expect(result).toBe('queued');
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockEnqueueUpload).toHaveBeenCalledWith(
      'id_document_path',
      LOCAL_ID,
      expect.any(String)
    );
    expect(mockQueueSave).toHaveBeenCalledTimes(1);
    expect(mockRunSync).toHaveBeenCalledWith({ forceNetworkCheck: true });
  });

  it('does not queue or upload when the user has not attached a local file', async () => {
    mockRunOnlineFirst.mockImplementation(async (_label: string, fn: () => Promise<unknown>) => {
      await fn();
      return { ok: true, value: true };
    });
    mockSaveKyc.mockResolvedValue({});

    const result = await persistKycDocumentsThenSave(
      'tok',
      { id_document_path: '/uploads/already-on-server.jpg' },
      {}
    );

    expect(result).toBe('online');
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockEnqueueUpload).not.toHaveBeenCalled();
    expect(mockSaveKyc).toHaveBeenCalled();
  });

  it('treats a recovered reconnect sync as online after Save queued the record', async () => {
    mockRunOnlineFirst.mockResolvedValue({ ok: false, reason: 'network_exhausted' });
    mockPendingCount.mockResolvedValue(0);

    const result = await persistKycDocumentsThenSave(
      'tok',
      { national_id: 'MW1' },
      { id_document_path: LOCAL_ID }
    );

    expect(result).toBe('online');
    expect(mockQueueSave).toHaveBeenCalled();
  });
});
