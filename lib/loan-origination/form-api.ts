import { inferFormTypeFromProduct } from '@/lib/loan-product-context';
import type { LoanProductRow } from '@/lib/loan-products/loan-products-cache';
import {
  getLoanFormSchemaLocal,
  refreshLoanFormSchemaForProduct,
} from '@/lib/loan-origination/origination-prefetch';
import { resolveLoanFormPayload } from '@/lib/loan-origination/form-fallback';
import type { LoanFormSchema } from './types';

function withFormType(schema: LoanFormSchema, explicit: string): LoanFormSchema {
  return { ...schema, form_type: schema.form_type || explicit };
}

async function fetchLoanFormFromNetwork(
  token: string,
  category: string | undefined,
  productName: string | undefined,
  clientId?: number
): Promise<LoanFormSchema> {
  const ft = inferFormTypeFromProduct(category, productName);
  const { apiGetLoanFormForProduct, apiGetLoanFormByType } = await import('@/lib/data/api');

  try {
    let schema = await apiGetLoanFormForProduct(token, category, productName, clientId);
    let resolved = resolveLoanFormPayload(schema, { category, productName, formType: ft });
    if (!resolved.fields.length) {
      schema = await apiGetLoanFormByType(token, ft, clientId);
      resolved = resolveLoanFormPayload(schema, { formType: ft, category, productName });
    }
    return withFormType(resolved, ft);
  } catch {
    return withFormType(
      resolveLoanFormPayload(null, { category, productName, formType: ft }),
      ft
    );
  }
}

export async function fetchLoanFormSchemaForProduct(
  token: string,
  category: string | undefined,
  productName: string | undefined,
  clientId?: number,
  product?: Pick<LoanProductRow, 'id' | 'category' | 'name'>
): Promise<LoanFormSchema> {
  const productRef: LoanProductRow = product
    ? { id: product.id, name: product.name, category: product.category }
    : { id: 0, name: productName ?? '', category };

  const cached = product?.id
    ? await getLoanFormSchemaLocal(productRef, clientId)
    : null;
  if (cached?.fields?.length) {
    const ft = inferFormTypeFromProduct(category, productName);
    return withFormType(cached, ft);
  }

  try {
    if (product?.id) {
      const refreshed = await refreshLoanFormSchemaForProduct(token, productRef, clientId);
      if (refreshed?.fields?.length) {
        return withFormType(refreshed, inferFormTypeFromProduct(category, productName));
      }
    }
  } catch {
    /* fall through to network + bundled fallback */
  }

  const normalized = await fetchLoanFormFromNetwork(
    token,
    product?.category ?? category,
    product?.name ?? productName,
    clientId
  );

  if (product?.id && normalized.fields.length > 0) {
    void refreshLoanFormSchemaForProduct(token, productRef, clientId).catch(() => undefined);
  }

  return normalized;
}

export function deriveLoanTypeForApi(product?: { name?: string; category?: string }): string | undefined {
  if (!product) return undefined;
  const fromName = (product.name || '').trim().split(/\s+/).filter(Boolean);
  if (fromName.length > 0) return fromName[0].toLowerCase().slice(0, 50);
  const cat = (product.category || '').trim().toLowerCase();
  return cat ? cat.slice(0, 50) : undefined;
}

export const STRATEGY_LABELS: Record<string, string> = {
  DECLINING_BALANCE_EQUAL_INSTALLMENTS: 'Reducing Balance (Equal Installments)',
  FLAT_RATE_EQUAL_INSTALLMENTS: 'Flat Rate (Equal Installments)',
  EQUAL_PRINCIPAL: 'Equal Principal Payments',
  BULLET: 'Bullet (Interest-Only, Lump Sum at End)',
  BALLOON: 'Balloon Payment',
  INTEREST_ONLY: 'Interest Only',
  SEASONAL_AGRICULTURAL: 'Seasonal Agricultural',
  HARVEST_YIELD_LINKED: 'Harvest / Yield Linked',
};

export function strategyLabel(token: string): string {
  return STRATEGY_LABELS[token] ?? token.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Requested principal in tambala (minor units), matching API / MwkMoneyInput. */
export function getRequestedAmountMinor(values: Record<string, string | number>): number {
  const v = values.loan_requested_mwk;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Default term when the form field is empty — prefer product maximum. */
export function defaultTermMonthsForProduct(product?: {
  minimum_term_months?: number;
  maximum_term_months?: number;
}): number {
  if (!product) return 12;
  const max = product.maximum_term_months ?? 0;
  const min = product.minimum_term_months ?? 0;
  if (max > 0) return max;
  if (min > 0) return min;
  return 12;
}

export function getTermMonths(
  values: Record<string, string | number>,
  formType?: string,
  fallback = 12
): number {
  const v = values.requested_term_months;
  if (typeof v === 'number' && v > 0) return v;
  const n = parseInt(String(v ?? ''), 10);
  if (Number.isFinite(n) && n > 0) return n;
  if (formType === 'SME' && values.maturity_date) {
    const maturity = new Date(String(values.maturity_date));
    const today = new Date();
    if (!isNaN(maturity.getTime())) {
      return Math.max(1, Math.round((maturity.getTime() - today.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
    }
  }
  return fallback;
}

export function getPurpose(values: Record<string, string | number>, formType?: string): string {
  const raw = String(values.loan_purpose ?? '').trim();
  if (formType === 'AGRICULTURAL' && raw === 'Other') {
    const spec = String(values.loan_purpose_other ?? '').trim();
    return spec ? `Other: ${spec}` : raw;
  }
  return raw;
}
