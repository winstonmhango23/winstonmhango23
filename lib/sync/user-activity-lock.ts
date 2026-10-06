/**
 * Capture / compose lock — background sync must not run while the officer
 * is still picking photos or files. Queue writes happen only on Save.
 */

let captureDepth = 0;
let deferredSyncRequested = false;
const idleListeners = new Set<() => void>();

export function isUserCapturing(): boolean {
  return captureDepth > 0;
}

export function beginUserCapture(): void {
  captureDepth += 1;
}

export function endUserCapture(): void {
  captureDepth = Math.max(0, captureDepth - 1);
  if (captureDepth === 0) {
    idleListeners.forEach((listener) => {
      try {
        listener();
      } catch {
        /* ignore */
      }
    });
  }
}

export async function withUserCapture<T>(fn: () => Promise<T>): Promise<T> {
  beginUserCapture();
  try {
    return await fn();
  } finally {
    endUserCapture();
  }
}

/** Remember that a reconnect/periodic sync was skipped during capture. */
export function requestDeferredSync(): void {
  deferredSyncRequested = true;
}

export function consumeDeferredSyncRequest(): boolean {
  if (!deferredSyncRequested) return false;
  deferredSyncRequested = false;
  return true;
}

export function onCaptureIdle(listener: () => void): () => void {
  idleListeners.add(listener);
  return () => idleListeners.delete(listener);
}

/** Test helper — do not call from app code. */
export function resetUserCaptureForTests(): void {
  captureDepth = 0;
  deferredSyncRequested = false;
  idleListeners.clear();
}
