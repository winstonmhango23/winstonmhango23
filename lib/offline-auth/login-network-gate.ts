/**
 * Gate offline sign-in fallback behind repeated network-unavailability checks.
 * Prevents silent offline login when Wi‑Fi/cellular is up but the auth request failed.
 *
 * Offline is allowed ONLY when several consecutive checks agree:
 * 1) OS reports no data link, AND
 * 2) API host probe fails.
 * Any positive data-link or API probe result blocks offline login immediately.
 */

import { logger } from '@/lib/logger';
import { networkManager } from '@/lib/network-manager';

export const LOGIN_OFFLINE_NETWORK_CHECKS = 5;
export const LOGIN_OFFLINE_CHECK_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true only after several consecutive checks agree the device cannot reach
 * the network/API. Any positive data-link or API probe result blocks offline login.
 */
export async function shouldAllowOfflineLoginFallback(): Promise<boolean> {
  let unavailableChecks = 0;

  for (let i = 0; i < LOGIN_OFFLINE_NETWORK_CHECKS; i++) {
    if (i > 0) {
      await sleep(LOGIN_OFFLINE_CHECK_DELAY_MS);
    }

    // Fresh probe every iteration — do not trust a stale cache.
    await networkManager.forceRefresh();
    const hasLink = await networkManager.hasDataLink();
    if (hasLink) {
      logger.info('Offline login fallback blocked: OS reports a data link', {
        module: 'login-network-gate',
        check: i + 1,
      });
      return false;
    }

    const apiReachable = await networkManager.getIsOnline(true);
    if (apiReachable) {
      logger.info('Offline login fallback blocked: API host reachable', {
        module: 'login-network-gate',
        check: i + 1,
      });
      return false;
    }

    unavailableChecks++;
  }

  const allowed = unavailableChecks >= LOGIN_OFFLINE_NETWORK_CHECKS;
  logger.info(
    allowed
      ? 'Offline login fallback allowed after repeated unavailable checks'
      : 'Offline login fallback blocked: network status inconclusive',
    { module: 'login-network-gate', unavailableChecks, required: LOGIN_OFFLINE_NETWORK_CHECKS }
  );
  return allowed;
}
