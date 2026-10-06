/**
 * Long-lived cache for public registration branches/districts (offline registration forms).
 */

import { isNetworkError } from '@/lib/cache';

import {
  fetchPublicRegistrationBranches,
  fetchPublicRegistrationDistricts,
  type PublicRegistrationBranch,
  type PublicRegistrationDistrict,
} from './api';

const CACHE_PREFIX = 'cofi_reg_cache_';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function getStorage() {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  return AsyncStorage;
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const storage = await getStorage();
    const raw = await storage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - ts > TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const storage = await getStorage();
    await storage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

export async function fetchPublicRegistrationBranchesCached(): Promise<{
  branches: PublicRegistrationBranch[];
  fromCache: boolean;
}> {
  try {
    const branches = await fetchPublicRegistrationBranches();
    await writeCache('branches', branches);
    return { branches, fromCache: false };
  } catch (e) {
    const cached = await readCache<PublicRegistrationBranch[]>('branches');
    if (cached?.length) {
      return { branches: cached, fromCache: true };
    }
    if (isNetworkError(e)) {
      throw new Error('Could not load branches. Connect once while online to cache branch list.');
    }
    throw e;
  }
}

export async function fetchPublicRegistrationDistrictsCached(
  branchId?: number
): Promise<{ districts: PublicRegistrationDistrict[]; fromCache: boolean }> {
  const key = `districts_${typeof branchId === 'number' ? branchId : 'all'}`;
  try {
    const districts = await fetchPublicRegistrationDistricts(branchId);
    await writeCache(key, districts);
    return { districts, fromCache: false };
  } catch (e) {
    const cached = await readCache<PublicRegistrationDistrict[]>(key);
    if (cached?.length) {
      return { districts: cached, fromCache: true };
    }
    if (isNetworkError(e)) {
      return { districts: [], fromCache: false };
    }
    throw e;
  }
}

/** Warm branch + district lists when online (safe to call in background). */
export async function prefetchRegistrationLocations(): Promise<void> {
  try {
    const { branches } = await fetchPublicRegistrationBranchesCached();
    await Promise.all(
      branches.slice(0, 8).map(async (b) => {
        try {
          await fetchPublicRegistrationDistrictsCached(b.id);
        } catch {
          /* ignore per-branch failures */
        }
      })
    );
  } catch {
    /* ignore */
  }
}
