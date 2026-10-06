/**
 * Enhanced network state detection with fallback mechanisms.
 * Provides reliable online/offline status for online-first origination + sync.
 */

import { logger } from '@/lib/logger';
import * as Network from 'expo-network';
import { config } from '@/lib/config';

type NetworkListener = (isOnline: boolean) => void;

class NetworkManager {
  private isOnline = true;
  private listeners: Set<NetworkListener> = new Set();
  private lastCheckTime = 0;
  private CHECK_INTERVAL_MS = 5000; // Check every 5 seconds max
  private isChecking = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private networkSubscription: { remove: () => void } | null = null;

  async initialize(): Promise<void> {
    try {
      await this.readInitialNetworkState();
    } catch (error) {
      logger.error(
        'Failed to initialize network state',
        error instanceof Error ? error : new Error(String(error)),
        { module: 'network-manager' }
      );
      // Assume online by default
      this.isOnline = true;
    }

    // Monitor network changes (expo-network API — not DOM addEventListener)
    try {
      this.networkSubscription?.remove();
      this.networkSubscription = Network.addNetworkStateListener((event) => {
        void this.handleNetworkChange(event);
      });
    } catch (error) {
      logger.warn('Network change listener not supported on this platform', {
        module: 'network-manager',
      });
      this.startPollingFallback();
    }
  }

  /** Tear down listener + poll timer (tests / hot reload). */
  dispose(): void {
    this.networkSubscription?.remove();
    this.networkSubscription = null;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private startPollingFallback(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.getIsOnline(true);
    }, this.CHECK_INTERVAL_MS);
  }

  private async readInitialNetworkState(): Promise<void> {
    const state = await Network.getNetworkStateAsync();
    this.isOnline = this.resolveOnlineFromState(state);
    logger.info(`Network initialized: ${this.isOnline ? 'online' : 'offline'}`, {
      module: 'network-manager',
    });
  }

  private async handleNetworkChange(state: Network.NetworkState): Promise<void> {
    const wasOnline = this.isOnline;
    this.isOnline = this.resolveOnlineFromState(state);

    if (wasOnline !== this.isOnline) {
      logger.info(`Network status changed: ${this.isOnline ? 'online' : 'offline'}`, {
        module: 'network-manager',
      });
      this.notifyListeners();
    }
  }

  private resolveOnlineFromState(state: Network.NetworkState): boolean {
    // Only an explicit disconnected link is treated as offline here.
    // isInternetReachable is often false on Expo Go while fetch() still works;
    // forceRefresh() uses an API probe for definitive reachability.
    if (state.isConnected === false) return false;
    return true;
  }

  /** Lightweight reachability probe against the API host (no auth). */
  private async probeApiReachability(): Promise<boolean> {
    const base = config.apiBase.replace(/\/api\/v1\/?$/, '');
    // Prefer dedicated probes; fall back to /api/v1/ which also returns 200.
    const candidates = [`${base}/health`, `${base}/health/live`, config.apiBase];
    // Per-candidate AbortController so a hung /health does not abort the fallback URL.
    for (const url of candidates) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        });
        // Any HTTP response proves the host is reachable.
        if (res.status > 0) return true;
      } catch {
        /* try next candidate */
      } finally {
        clearTimeout(timer);
      }
    }
    return false;
  }

  async getIsOnline(forceRefresh = false): Promise<boolean> {
    const now = Date.now();

    // Return cached value if recent
    if (!forceRefresh && now - this.lastCheckTime < this.CHECK_INTERVAL_MS) {
      return this.isOnline;
    }

    // Prevent concurrent checks
    if (this.isChecking) {
      return this.isOnline;
    }

    this.isChecking = true;
    try {
      const state = await Network.getNetworkStateAsync();
      let newIsOnline = this.resolveOnlineFromState(state);

      // Probe API when link is up — success confirms online; failure must NOT
      // poison the cache to offline while the data link is connected (API can
      // be briefly unreachable while Wi‑Fi is fine).
      if (forceRefresh && state.isConnected !== false) {
        const reachable = await this.probeApiReachability();
        if (reachable) {
          newIsOnline = true;
        }
      }

      if (newIsOnline !== this.isOnline) {
        logger.debug(`Network status: ${newIsOnline ? 'online' : 'offline'}`, {
          module: 'network-manager',
        });
        this.isOnline = newIsOnline;
        this.notifyListeners();
      } else {
        this.isOnline = newIsOnline;
      }

      this.lastCheckTime = now;
      return this.isOnline;
    } catch (error) {
      logger.error(
        'Failed to check network state',
        error instanceof Error ? error : new Error(String(error)),
        { module: 'network-manager' }
      );
      // Return last known state
      return this.isOnline;
    } finally {
      this.isChecking = false;
    }
  }

  /** Bypass cache — use before save/sync actions. Probes API reachability. */
  async forceRefresh(): Promise<boolean> {
    this.lastCheckTime = 0;
    return this.getIsOnline(true);
  }

  /**
   * OS data-link only (Wi‑Fi/cellular). Ignores API probe / reachability.
   * Use before online-first writes so a failed /health probe does not skip POST.
   */
  async hasDataLink(): Promise<boolean> {
    try {
      const state = await Network.getNetworkStateAsync();
      // null/unknown isConnected → treat as online (only explicit false is offline).
      return state.isConnected !== false;
    } catch {
      return true;
    }
  }

  subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.isOnline);
      } catch (error) {
        logger.error(
          'Network listener error',
          error instanceof Error ? error : new Error(String(error)),
          { module: 'network-manager' }
        );
      }
    });
  }

  getCurrentStatus(): boolean {
    return this.isOnline;
  }
}

export const networkManager = new NetworkManager();

/**
 * Hook to subscribe to network status changes
 */
export function useNetworkStatus(onNetworkChange: (isOnline: boolean) => void): () => void {
  return networkManager.subscribe(onNetworkChange);
}
