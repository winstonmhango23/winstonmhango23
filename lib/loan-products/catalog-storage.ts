/**
 * Dual-layer loan product catalog persistence (scoped AsyncStorage + SQLite mirror).
 * AsyncStorage is primary for reads at modal open — survives early SQLite init races on Android.
 */

import type { LoanProductAudience } from '@/lib/data/sqlite';
import * as sqlite from '@/lib/data/sqlite';
import { warmAppDatabase } from '@/lib/data/sqlite';
import { scopedGetItemOptional, scopedSetItem } from '@/lib/account-scope';
import { logger } from '@/lib/logger';

function storageKey(audience: LoanProductAudience): string {
  return `loan_products_catalog_${audience}`;
}

export async function readLoanProductsCatalog(
  audience: LoanProductAudience
): Promise<{ products: unknown[]; cached_at: string | null }> {
  try {
    const raw = await scopedGetItemOptional(storageKey(audience));
    if (raw) {
      const parsed = JSON.parse(raw) as { products: unknown[]; cached_at: string };
      if (Array.isArray(parsed.products) && parsed.products.length > 0) {
        return { products: parsed.products, cached_at: parsed.cached_at ?? null };
      }
    }
  } catch {
    /* fall through to sqlite */
  }

  try {
    await warmAppDatabase();
    const row = await sqlite.sqliteGetLoanProductsCatalog(audience);
    if (row?.products?.length) {
      return {
        products: row.products,
        cached_at: row.cached_at,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug(`SQLite loan catalog read skipped: ${message}`, {
      module: 'loan-products-catalog-storage',
    });
  }

  return { products: [], cached_at: null };
}

export async function writeLoanProductsCatalog(
  audience: LoanProductAudience,
  products: unknown[]
): Promise<void> {
  const cached_at = new Date().toISOString();
  const payload = { products, cached_at };

  try {
    await scopedSetItem(storageKey(audience), JSON.stringify(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`AsyncStorage loan catalog write failed: ${message}`, {
      module: 'loan-products-catalog-storage',
    });
  }

  try {
    await warmAppDatabase();
    await sqlite.sqliteUpsertLoanProductsCatalog(audience, products);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`SQLite loan catalog mirror failed (AsyncStorage copy kept): ${message}`, {
      module: 'loan-products-catalog-storage',
    });
  }
}
