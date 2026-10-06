import { describe, it, expect, jest } from '@jest/globals';
import { retryNetworkOperation } from '@/lib/network-retry';

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/cache', () => ({
  isNetworkError: (e: unknown) =>
    e instanceof Error && /network|fetch|timeout/i.test(e.message),
}));

describe('retryNetworkOperation', () => {
  it('returns on first success', async () => {
    const fn = jest.fn(async () => 'ok');
    await expect(retryNetworkOperation(fn, { maxAttempts: 3, baseDelayMs: 1 })).resolves.toBe(
      'ok'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries network errors then succeeds', async () => {
    const fn = jest
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce('done');
    await expect(
      retryNetworkOperation(fn, { maxAttempts: 3, baseDelayMs: 1 })
    ).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-network errors immediately', async () => {
    const fn = jest.fn(async () => {
      throw new Error('validation failed');
    });
    await expect(retryNetworkOperation(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow(
      /validation/
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
