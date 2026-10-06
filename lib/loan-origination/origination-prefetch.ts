/**
 * Prefetch + local cache for loan origination server dependencies.
 */

import { waitForAuthHydration, getAuthToken } from '@/lib/auth-token';
import { USE_API } from '@/lib/config-flags';
import * as api from '@/lib/data/api';
import type { LoanProductAudience } from '@/lib/data/sqlite';
import { inferFormTypeFromProduct } from '@/lib/loan-product-context';
import {
  loanFormCacheKey,
  loanFormTypeCacheKey,
  readOriginationCache,
  writeOriginationCache,
} from '@/lib/loan-origination/origination-cache-storage';
import { resolveLoanFormPayload } from '@/lib/loan-origination/form-fallback';
import type { LoanFormSchema } from '@/lib/loan-origination/types';
import {
  getLoanProductsLocal,
  type LoanProductRow,
} from '@/lib/loan-products/loan-products-cache';
import { resolveSessionRole } from '@/lib/loan-products/session-role';
import { logger } from '@/lib/logger';
import { networkManager } from '@/lib/network-manager';
import { useAuthStore } from '@/store/auth';

function schemaHasFields(schema: LoanFormSchema | null | undefined): boolean {
  return Boolean(schema?.fields?.length);
}

export async function getDistrictsLocal(): Promise<string[]> {
  const cached = await readOriginationCache<string[]>('districts');
  return Array.isArray(cached) ? cached.filter(Boolean) : [];
}

export async function refreshDistricts(): Promise<string[]> {
  if (!USE_API) return [];
  const token = await getAuthToken();
  const names = await api.apiGetCanonicalDistricts(token);
  if (names.length > 0) await writeOriginationCache('districts', names);
  return names;
}

export async function getCustomerProfileLocal(
  clientId: number
): Promise<api.ApiCustomerProfile | null> {
  return readOriginationCache<api.ApiCustomerProfile>(`profile_${clientId}`);
}

export async function getMobileSessionLocal(): Promise<api.MobileClientSessionContext | null> {
  return readOriginationCache<api.MobileClientSessionContext>('mobile_session');
}

export async function getGroupMembersLocal(): Promise<api.MobileGroupMemberCredentialsItem[]> {
  const cached = await readOriginationCache<api.MobileGroupMemberCredentialsItem[]>('group_members');
  return Array.isArray(cached) ? cached : [];
}

export async function writeGroupMembersLocal(
  members: api.MobileGroupMemberCredentialsItem[]
): Promise<void> {
  if (members.length === 0) return;
  await writeOriginationCache('group_members', members);
}

export async function getLoanFormSchemaLocal(
  product: Pick<LoanProductRow, 'id' | 'category' | 'name'>,
  clientId?: number
): Promise<LoanFormSchema | null> {
  const scoped = await readOriginationCache<LoanFormSchema>(
    loanFormCacheKey(product.id, clientId)
  );
  if (schemaHasFields(scoped)) return scoped;

  const generic = await readOriginationCache<LoanFormSchema>(loanFormCacheKey(product.id));
  if (schemaHasFields(generic)) return generic;

  const formType = inferFormTypeFromProduct(product.category, product.name);
  const byTypeScoped = await readOriginationCache<LoanFormSchema>(
    loanFormTypeCacheKey(formType, clientId)
  );
  if (schemaHasFields(byTypeScoped)) return byTypeScoped;

  const byType = await readOriginationCache<LoanFormSchema>(loanFormTypeCacheKey(formType));
  return schemaHasFields(byType) ? byType : null;
}

async function fetchAndCacheLoanForm(
  token: string,
  product: LoanProductRow,
  clientId?: number
): Promise<LoanFormSchema | null> {
  const { apiGetLoanFormForProduct, apiGetLoanFormByType } = api;
  const formType = inferFormTypeFromProduct(product.category, product.name);

  let normalized: LoanFormSchema;
  try {
    let schema = await apiGetLoanFormForProduct(token, product.category, product.name, clientId);
    normalized = resolveLoanFormPayload(schema, {
      category: product.category,
      productName: product.name,
      formType,
    });
    if (!normalized.fields.length) {
      schema = await apiGetLoanFormByType(token, formType, clientId);
      normalized = resolveLoanFormPayload(schema, {
        formType,
        category: product.category,
        productName: product.name,
      });
    }
    normalized = {
      ...normalized,
      form_type: normalized.form_type || formType,
    };
  } catch {
    normalized = resolveLoanFormPayload(null, {
      category: product.category,
      productName: product.name,
      formType,
    });
  }

  if (!schemaHasFields(normalized)) return null;

  await writeOriginationCache(loanFormCacheKey(product.id, clientId), normalized);
  await writeOriginationCache(loanFormCacheKey(product.id), normalized);
  await writeOriginationCache(loanFormTypeCacheKey(formType, clientId), normalized);
  await writeOriginationCache(loanFormTypeCacheKey(formType), normalized);
  return normalized;
}

let prefetchInFlight: Promise<void> | null = null;

/** Warm all origination dependencies after loan products are cached. */
export async function prefetchOriginationDependencies(
  audience: LoanProductAudience
): Promise<void> {
  if (!USE_API) return;

  if (prefetchInFlight) {
    await prefetchInFlight;
    return;
  }

  prefetchInFlight = (async () => {
    try {
      await waitForAuthHydration();
      if (!useAuthStore.getState().token) return;

      const online = await networkManager.getIsOnline();
      if (!online) return;

      const token = await getAuthToken();
      const role = await resolveSessionRole();
      if (!role) return;

      const products = await getLoanProductsLocal(audience);
      if (products.length === 0) return;

      try {
        const districts = await api.apiGetCanonicalDistricts(token);
        if (districts.length > 0) await writeOriginationCache('districts', districts);
      } catch {
        /* districts optional */
      }

      let clientId: number | undefined;
      if (role === 'client') {
        try {
          const session = await api.apiGetMobileSession(token);
          await writeOriginationCache('mobile_session', session);
          clientId = session.client_id;

          const profile = await api.apiGetCustomerProfile(token);
          if (session.client_id) {
            await writeOriginationCache(`profile_${session.client_id}`, profile);
          }

          if (session.dashboard_mode === 'group_parent') {
            const members = await api.apiGetMobileGroupMembersCredentials(token);
            await writeOriginationCache('group_members', members);
          }
        } catch {
          /* session/profile optional for prefetch */
        }
      }

      await Promise.all(
        products.map(async (product) => {
          try {
            await fetchAndCacheLoanForm(token, product, clientId);
          } catch {
            /* per-product failure */
          }
        })
      );

      logger.info(
        `Origination prefetch complete (${audience}, products=${products.length})`,
        { module: 'origination-prefetch' }
      );
    } catch (error) {
      logger.error(
        'Origination prefetch failed',
        error instanceof Error ? error : new Error(String(error)),
        { module: 'origination-prefetch' }
      );
    } finally {
      prefetchInFlight = null;
    }
  })();

  await prefetchInFlight;
}

export async function refreshLoanFormSchemaForProduct(
  token: string,
  product: LoanProductRow,
  clientId?: number
): Promise<LoanFormSchema | null> {
  return fetchAndCacheLoanForm(token, product, clientId);
}
