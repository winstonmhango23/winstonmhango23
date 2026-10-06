/**
 * Production initialization – sets up logging, monitoring, and network.
 * Call this in your root app layout before rendering anything.
 */

import { logger } from '@/lib/logger';
import { warmSharedAuthDatabase, warmAppDatabase } from '@/lib/data/sqlite';
import { getActiveAccountScopeId } from '@/lib/account-scope';
import { shouldSkipProductionInit } from '@/lib/runtime-environment';
import { networkManager } from '@/lib/network-manager';
import { performanceMonitor } from '@/lib/performance-monitor';

let initialized = false;

export async function initializeProduction(): Promise<void> {
  if (initialized) return;

  // Lightweight init even in Expo Go — network + sync are required for loan uploads.
  if (shouldSkipProductionInit()) {
    await networkManager.initialize();
    void warmSharedAuthDatabase().catch(() => undefined);
    const { USE_API } = await import('@/lib/config-flags');
    if (USE_API) {
      const { initNetworkListener } = await import('@/lib/sync/network-listener');
      initNetworkListener();
    }
    initialized = true;
    logger.info('Production init (compat): network + sync listener only', {
      module: 'production-init',
    });
    return;
  }

  try {
    // Initialize network manager
    await networkManager.initialize();
    logger.info('Network manager initialized', { module: 'production-init' });

    const { initNetworkListener } = await import('@/lib/sync/network-listener');
    initNetworkListener();
    logger.info('Network listener initialized', { module: 'production-init' });

    void warmSharedAuthDatabase().catch(() => undefined);

    if (await networkManager.getIsOnline()) {
      if (getActiveAccountScopeId()) {
        void warmAppDatabase().catch(() => undefined);
        import('@/lib/loan-products/loan-products-cache')
          .then((m) => m.prefetchLoanProductsForCurrentUser())
          .catch(() => {});
      }
      import('@/lib/client-portal/registration-cache')
        .then((m) => m.prefetchRegistrationLocations())
        .catch(() => {});
    }

    // Initialize performance monitoring
    performanceMonitor.clear();
    logger.info('Performance monitor initialized', { module: 'production-init' });

    initialized = true;
    logger.info('Production environment ready', { module: 'production-init' });
  } catch (error) {
    logger.error(
      'Failed to initialize production environment',
      error instanceof Error ? error : new Error(String(error)),
      { module: 'production-init' }
    );
    // Continue anyway - not critical
  }
}

export function getInitializationStatus(): boolean {
  return initialized;
}
