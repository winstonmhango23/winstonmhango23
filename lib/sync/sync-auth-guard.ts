/** When true, api-client must not logout on 401 (sync will record failure instead). */

let syncAuthGuardDepth = 0;

export function beginSyncAuthGuard(): void {
  syncAuthGuardDepth += 1;
}

export function endSyncAuthGuard(): void {
  syncAuthGuardDepth = Math.max(0, syncAuthGuardDepth - 1);
}

export function isSyncAuthGuardActive(): boolean {
  return syncAuthGuardDepth > 0;
}
