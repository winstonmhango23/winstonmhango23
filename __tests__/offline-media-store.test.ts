/**
 * Captured photos must be copied out of the OS cache before they are queued,
 * otherwise Android/iOS can purge a KYC photo before the device regains signal.
 */

const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockCopyAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  get documentDirectory() {
    return 'file:///data/app/documents/';
  },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  copyAsync: (...args: unknown[]) => mockCopyAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

jest.mock('@/lib/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  deleteOfflineMedia,
  isPersistedOfflineMedia,
  persistOfflineMedia,
} from '@/lib/media/offline-media-store';

const CACHE_URI = 'file:///data/app/cache/ImagePicker/abc123.jpg';

describe('persistOfflineMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockCopyAsync.mockResolvedValue(undefined);
  });

  it('copies a cache capture into the durable offline-media directory', async () => {
    const result = await persistOfflineMedia(CACHE_URI, { name: 'id-front.jpg' });

    expect(mockCopyAsync).toHaveBeenCalledTimes(1);
    expect(result).toContain('/offline-media/');
    expect(result.endsWith('.jpg')).toBe(true);
    expect(result).not.toBe(CACHE_URI);
  });

  it('creates the directory when it does not exist yet', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });

    await persistOfflineMedia(CACHE_URI);

    expect(mockMakeDirectoryAsync).toHaveBeenCalledWith(
      expect.stringContaining('/offline-media/'),
      { intermediates: true }
    );
  });

  it('keeps the original URI when the copy fails rather than losing the capture', async () => {
    mockCopyAsync.mockRejectedValue(new Error('no space left on device'));

    await expect(persistOfflineMedia(CACHE_URI)).resolves.toBe(CACHE_URI);
  });

  it('leaves remote and data URIs untouched', async () => {
    await expect(persistOfflineMedia('https://cdn.example.com/a.jpg')).resolves.toBe(
      'https://cdn.example.com/a.jpg'
    );
    await expect(persistOfflineMedia('data:image/jpeg;base64,AAAA')).resolves.toBe(
      'data:image/jpeg;base64,AAAA'
    );
    expect(mockCopyAsync).not.toHaveBeenCalled();
  });

  it('does not copy a file that is already persisted', async () => {
    const persisted = 'file:///data/app/documents/offline-media/1-abc.jpg';
    await expect(persistOfflineMedia(persisted)).resolves.toBe(persisted);
    expect(mockCopyAsync).not.toHaveBeenCalled();
  });

  it('preserves a pdf extension from the picked file name', async () => {
    const result = await persistOfflineMedia('file:///data/app/cache/doc', {
      name: 'constitution.pdf',
    });
    expect(result.endsWith('.pdf')).toBe(true);
  });
});

describe('isPersistedOfflineMedia', () => {
  it('recognises durable paths only', () => {
    expect(isPersistedOfflineMedia('file:///x/offline-media/1.jpg')).toBe(true);
    expect(isPersistedOfflineMedia(CACHE_URI)).toBe(false);
    expect(isPersistedOfflineMedia(null)).toBe(false);
  });
});

describe('deleteOfflineMedia', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes persisted files once uploaded', async () => {
    await deleteOfflineMedia('file:///x/offline-media/1.jpg');
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///x/offline-media/1.jpg', {
      idempotent: true,
    });
  });

  it('never touches files outside durable storage', async () => {
    await deleteOfflineMedia(CACHE_URI);
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });
});
