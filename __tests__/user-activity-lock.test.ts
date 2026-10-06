/**
 * Capture lock: background sync must wait until the officer finishes picking media.
 * Run: npx jest __tests__/user-activity-lock.test.ts
 */

import {
  beginUserCapture,
  consumeDeferredSyncRequest,
  endUserCapture,
  isUserCapturing,
  onCaptureIdle,
  requestDeferredSync,
  resetUserCaptureForTests,
  withUserCapture,
} from '@/lib/sync/user-activity-lock';

describe('user-activity-lock', () => {
  beforeEach(() => {
    resetUserCaptureForTests();
  });

  it('nests capture depth and reports idle only when fully released', () => {
    beginUserCapture();
    beginUserCapture();
    expect(isUserCapturing()).toBe(true);
    endUserCapture();
    expect(isUserCapturing()).toBe(true);
    endUserCapture();
    expect(isUserCapturing()).toBe(false);
  });

  it('runs idle listeners once capture ends', () => {
    const idle = jest.fn();
    const unsub = onCaptureIdle(idle);
    beginUserCapture();
    expect(idle).not.toHaveBeenCalled();
    endUserCapture();
    expect(idle).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('defers a sync request until consume after idle', () => {
    requestDeferredSync();
    expect(consumeDeferredSyncRequest()).toBe(true);
    expect(consumeDeferredSyncRequest()).toBe(false);
  });

  it('withUserCapture always releases the lock', async () => {
    await expect(
      withUserCapture(async () => {
        expect(isUserCapturing()).toBe(true);
        throw new Error('picker cancelled');
      })
    ).rejects.toThrow('picker cancelled');
    expect(isUserCapturing()).toBe(false);
  });
});
