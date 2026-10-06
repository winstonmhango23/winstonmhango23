/**
 * Network listener – triggers sync when connection is restored and every 15s.
 * While offline, still polls connectivity every 15s so queued loan drafts upload
 * automatically as soon as the API is reachable again.
 */

import { logger } from '@/lib/logger';
import { networkManager } from '@/lib/network-manager';
import {
  consumeDeferredSyncRequest,
  isUserCapturing,
  onCaptureIdle,
  requestDeferredSync,
} from '@/lib/sync/user-activity-lock';

const PERIODIC_SYNC_MS = 15_000;

let lastConnected: boolean | null = null;
let unsubscribe: (() => void) | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let listenerInitialized = false;
let syncCycleInFlight = false;
let captureIdleUnsub: (() => void) | null = null;

async function triggerSync(reason: string): Promise<void> {
  if (isUserCapturing()) {
    requestDeferredSync();
    logger.debug(`Sync deferred (${reason}): user is capturing media`, {
      module: 'network-listener',
    });
    return;
  }
  if (syncCycleInFlight) return;
  syncCycleInFlight = true;
  try {
    const { getPendingSyncCount, runSyncIfOnline } = await import('./sync-service');
    const pending = await getPendingSyncCount();
    // Periodic probes must not hit the API when there is nothing to upload.
    if (pending === 0 && reason === 'periodic-15s') return;

    const online = await networkManager.forceRefresh();
    if (!online) {
      logger.debug(`Sync skipped (${reason}): offline`, { module: 'network-listener' });
      return;
    }

    if (pending === 0) return;

    // Avoid burning the queue before the user signs in (loan apps need JWT).
    // Portal registration ops can still sync without a session.
    const { useAuthStore } = await import('@/store/auth');
    const hasSession = Boolean(
      useAuthStore.getState().token || useAuthStore.getState().user
    );
    if (!hasSession) {
      logger.debug(`Sync deferred (${reason}): no session yet, pending=${pending}`, {
        module: 'network-listener',
      });
      // Still try portal-only path via runSync — it returns early without wiping queue.
      const portalOnly = await runSyncIfOnline({ forceNetworkCheck: true });
      if (portalOnly.synced > 0) {
        logger.info(`Portal sync finished without session (synced=${portalOnly.synced})`, {
          module: 'network-listener',
        });
      }
      return;
    }

    logger.info(`Auto-sync started (${reason}, pending=${pending})`, {
      module: 'network-listener',
    });

    const { validateSessionOnReconnect } = await import('@/lib/offline-auth/session-validator');
    await validateSessionOnReconnect();

    const result = await runSyncIfOnline({ forceNetworkCheck: true });
    if (result.offline) return;

    const { tryCompletePortalRegistrationHandoff } = await import(
      '@/lib/client-portal/portal-sync-handoff'
    );
    await tryCompletePortalRegistrationHandoff();
    import('@/lib/client-portal/registration-cache')
      .then((m) => m.prefetchRegistrationLocations())
      .catch(() => {});
    import('@/lib/loan-products/loan-products-cache')
      .then((m) => m.prefetchLoanProductsForCurrentUser())
      .catch(() => {});

    logger.info(
      `Auto-sync finished (synced=${result.synced}, failed=${result.failed}, deferred=${result.deferred ?? 0}, noAuth=${result.noAuth ? 1 : 0})`,
      { module: 'network-listener' }
    );
  } catch (error) {
    logger.error(
      'Auto-sync failed',
      error instanceof Error ? error : new Error(String(error)),
      { module: 'network-listener' }
    );
  } finally {
    syncCycleInFlight = false;
  }
}

function startPeriodicSync(): void {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => {
    void triggerSync('periodic-15s');
  }, PERIODIC_SYNC_MS);
}

export function initNetworkListener(): void {
  if (listenerInitialized) return;
  listenerInitialized = true;

  void networkManager.initialize().catch(() => undefined);

  void networkManager.getIsOnline(true).then((online) => {
    lastConnected = online;
    logger.info(`Sync network listener initialized (${online ? 'online' : 'offline'})`, {
      module: 'network-listener',
    });
    if (online) {
      void triggerSync('startup');
    }
  });

  unsubscribe = networkManager.subscribe((isConnected) => {
    const connected = isConnected ?? false;

    if (lastConnected === false && connected === true) {
      logger.info('Network reconnected, triggering sync', {
        module: 'network-listener',
      });
      lastConnected = true;
      void triggerSync('reconnect');
    } else {
      lastConnected = connected;
      if (!connected) {
        logger.info('Network disconnected, sync suspended until next 15s probe', {
          module: 'network-listener',
        });
      }
    }
  });

  startPeriodicSync();

  captureIdleUnsub = onCaptureIdle(() => {
    if (consumeDeferredSyncRequest()) {
      void triggerSync('after-capture');
    }
  });
}

export function cleanupNetworkListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (captureIdleUnsub) {
    captureIdleUnsub();
    captureIdleUnsub = null;
  }
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
  listenerInitialized = false;
  logger.debug('Network listener cleaned up', { module: 'network-listener' });
}
