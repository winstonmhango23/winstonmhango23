/**
 * Loan product catalog — prefetch at app startup, serve from local storage in origination UI.
 * Preserves server product ids and full metadata for offline / instant modal open.
 */

import { waitForAuthHydration, getAuthToken } from '@/lib/auth-token';
import { USE_API } from '@/lib/config-flags';
import type { ApiProduct } from '@/lib/data/api';
import * as api from '@/lib/data/api';
import type { LoanProductAudience } from '@/lib/data/sqlite';
import { warmAppDatabase } from '@/lib/data/sqlite';
import {
  readLoanProductsCatalog,
  writeLoanProductsCatalog,
} from '@/lib/loan-products/catalog-storage';
import { resolveSessionRole } from '@/lib/loan-products/session-role';
import { logger } from '@/lib/logger';
import { networkManager } from '@/lib/network-manager';
import { useAuthStore } from '@/store/auth';

export type LoanProductRow = {
  id: number;
  name: string;
  code?: string;
  category?: string;
  is_agricultural_product?: boolean;
  minimum_amount?: number;
  maximum_amount?: number;
  minimum_term_months?: number;
  maximum_term_months?: number;
  term_unit?: string;
  repayment_frequency?: string;
  collateral_required?: boolean;
  requires_guarantor?: boolean;
  interest_rate?: number;
  supported_repayment_strategies?: string[] | null;
  default_repayment_strategy?: string | null;
  /** Product-allowed collateral codes; empty/null = unrestricted. */
  accepted_collateral_types?: string[] | null;
  /** Minimum collateral coverage as % of loan amount (e.g. 200 = double). */
  min_collateral_coverage?: number | null;
  min_guarantors?: number | null;
  /** Client types allowed to apply (INDIVIDUAL, GROUP, SME, CORPORATE, COOPERATIVE, VILLAGE_BANKING_GROUP). NULL = all eligible. */
  eligible_client_types?: string[] | null;
  /** Visibility level (PUBLIC/INTERNAL/STAFF_ONLY/SELF_SERVICE). */
  visibility_level?: string | null;
};

function normalizeLoanProduct(raw: ApiProduct & { interest_rate?: number }): LoanProductRow {
  const accepted = Array.isArray(raw.accepted_collateral_types)
    ? raw.accepted_collateral_types
        .map((t) => String(t ?? '').toUpperCase().trim())
        .filter(Boolean)
    : null;
  return {
    id: Number(raw.id),
    name: raw.name,
    code: raw.code,
    category: raw.category,
    is_agricultural_product: raw.is_agricultural_product,
    minimum_amount: raw.minimum_amount,
    maximum_amount: raw.maximum_amount,
    minimum_term_months: raw.minimum_term_months,
    maximum_term_months: raw.maximum_term_months,
    term_unit: raw.term_unit,
    repayment_frequency: raw.repayment_frequency,
    collateral_required: raw.collateral_required,
    requires_guarantor: raw.requires_guarantor,
    interest_rate: raw.interest_rate,
    supported_repayment_strategies: raw.supported_repayment_strategies ?? null,
    default_repayment_strategy: raw.default_repayment_strategy ?? null,
    accepted_collateral_types: accepted && accepted.length > 0 ? accepted : null,
    min_collateral_coverage:
      raw.min_collateral_coverage != null && Number(raw.min_collateral_coverage) > 0
        ? Number(raw.min_collateral_coverage)
        : null,
    min_guarantors:
      raw.min_guarantors != null && Number(raw.min_guarantors) > 0
        ? Number(raw.min_guarantors)
        : null,
    eligible_client_types: Array.isArray(raw.eligible_client_types)
      ? raw.eligible_client_types
          .map((t) => String(t ?? '').toUpperCase().trim())
          .filter(Boolean)
      : null,
    visibility_level: raw.visibility_level
      ? String(raw.visibility_level).toUpperCase()
      : undefined,
  };
}

function parseStoredProducts(rows: unknown[]): LoanProductRow[] {
  const out: LoanProductRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Partial<LoanProductRow>;
    if (typeof r.id !== 'number' || !r.name) continue;
    out.push(normalizeLoanProduct(r as ApiProduct & { interest_rate?: number }));
  }
  return out.sort((a, b) => a.id - b.id);
}

export function audienceForRole(role: 'client' | 'staff' | null | undefined): LoanProductAudience {
  return role === 'client' ? 'client' : 'staff';
}

/** Read catalog from local storage only (instant — used when opening loan request modal). */
export async function getLoanProductsLocal(
  audience: LoanProductAudience
): Promise<LoanProductRow[]> {
  const cached = await readLoanProductsCatalog(audience);
  if (!cached.products.length) return [];
  return parseStoredProducts(cached.products);
}

async function fetchLoanProductsFromApi(audience: LoanProductAudience): Promise<LoanProductRow[]> {
  await waitForAuthHydration();
  const token = await getAuthToken();
  const rows =
    audience === 'client'
      ? await api.apiGetBorrowerLoanProducts(token)
      : await api.apiGetLoanProducts(token);
  return rows.map((row) => normalizeLoanProduct(row));
}

/** Network fetch + persist locally. */
export async function refreshLoanProducts(
  audience: LoanProductAudience
): Promise<LoanProductRow[]> {
  if (!USE_API) return [];
  const products = await fetchLoanProductsFromApi(audience);
  await writeLoanProductsCatalog(audience, products);
  logger.info(`Loan products cached (${audience}, count=${products.length})`, {
    module: 'loan-products-cache',
  });
  return products;
}

let prefetchInFlight: Promise<void> | null = null;

/** Warm catalog after login / app bootstrap when online. Safe to call in background. */
export async function prefetchLoanProductsForCurrentUser(): Promise<void> {
  if (!USE_API) return;

  if (prefetchInFlight) {
    await prefetchInFlight;
    return;
  }

  prefetchInFlight = (async () => {
    try {
      await waitForAuthHydration();
      const token = useAuthStore.getState().token;
      if (!token) return;

      const role = await resolveSessionRole();
      if (!role) {
        logger.debug('Loan products prefetch skipped (role not resolved yet)', {
          module: 'loan-products-cache',
        });
        return;
      }

      const online = await networkManager.getIsOnline();
      if (!online) {
        logger.debug('Loan products prefetch skipped (offline)', { module: 'loan-products-cache' });
        return;
      }

      void warmAppDatabase().catch(() => undefined);

      const audience = audienceForRole(role);
      await refreshLoanProducts(audience);
      const { prefetchOriginationDependencies } = await import(
        '@/lib/loan-origination/origination-prefetch'
      );
      await prefetchOriginationDependencies(audience);
    } catch (error) {
      logger.error(
        'Loan products prefetch failed',
        error instanceof Error ? error : new Error(String(error)),
        { module: 'loan-products-cache' }
      );
    } finally {
      prefetchInFlight = null;
    }
  })();

  await prefetchInFlight;
}

/** Cache-first read; fetches from API only when local catalog is empty. */
export async function getLoanProductsResolved(
  audience: LoanProductAudience
): Promise<LoanProductRow[]> {
  if (!USE_API) return [];

  const local = await getLoanProductsLocal(audience);
  if (local.length > 0) return local;

  try {
    const online = await networkManager.getIsOnline();
    if (!online) return [];
    return await refreshLoanProducts(audience);
  } catch {
    return [];
  }
}
