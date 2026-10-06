/**
 * Aggregate collateral & guarantors across loan applications plus borrower vault/catalog.
 * Mirrors backCFADash/lib/client-portal-collateral-guarantors-portfolio.ts for mobile.
 */

import type { ApiCollateral, ApiGuarantor } from '@/lib/data/api';

export type PortfolioApplicationRef = {
  id: number;
  application_number: string;
  product_name: string | null;
  status: string;
};

export type CollateralWithApplication = ApiCollateral & {
  application: PortfolioApplicationRef;
  is_vault?: boolean;
};

export type GuarantorWithApplication = ApiGuarantor & {
  application: PortfolioApplicationRef;
  is_vault?: boolean;
};

export const VAULT_APP_REF: PortfolioApplicationRef = {
  id: 0,
  application_number: 'LIBRARY',
  product_name: 'Saved for future loan requests',
  status: 'VAULT',
};

export type ApplicationLike = {
  id: number | string;
  remote_id?: number | null;
  application_number?: string | null;
  product_name?: string | null;
  status?: string | null;
};

/** Resolve a syncable remote application id from store/API rows. */
export function resolvePortfolioApplicationId(app: ApplicationLike): number | null {
  if (typeof app.remote_id === 'number' && Number.isFinite(app.remote_id) && app.remote_id > 0) {
    return app.remote_id;
  }
  if (typeof app.id === 'number' && Number.isFinite(app.id) && app.id > 0) return app.id;
  if (typeof app.id === 'string' && /^\d+$/.test(app.id.trim())) {
    const n = Number(app.id.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function toPortfolioApplicationRef(app: ApplicationLike): PortfolioApplicationRef | null {
  const id = resolvePortfolioApplicationId(app);
  if (id == null) return null;
  return {
    id,
    application_number: String(app.application_number || `APP-${id}`),
    product_name: app.product_name ?? null,
    status: String(app.status || 'UNKNOWN'),
  };
}

export function mergeCollateralPortfolio(opts: {
  vault: ApiCollateral[];
  perApplication: Array<{ ref: PortfolioApplicationRef; rows: ApiCollateral[] }>;
}): CollateralWithApplication[] {
  const out: CollateralWithApplication[] = [];
  for (const c of opts.vault) {
    if (c.is_active === false) continue;
    out.push({ ...c, application: VAULT_APP_REF, is_vault: true });
  }
  for (const { ref, rows } of opts.perApplication) {
    for (const c of rows) {
      if (c.is_active === false) continue;
      out.push({ ...c, application: ref, is_vault: false });
    }
  }
  out.sort((a, b) => {
    const av = a.is_vault ? 0 : 1;
    const bv = b.is_vault ? 0 : 1;
    if (av !== bv) return av - bv;
    return (b.id ?? 0) - (a.id ?? 0);
  });
  return out;
}

export function mergeGuarantorPortfolio(opts: {
  catalog: ApiGuarantor[];
  perApplication: Array<{ ref: PortfolioApplicationRef; rows: ApiGuarantor[] }>;
}): GuarantorWithApplication[] {
  const out: GuarantorWithApplication[] = [];
  for (const g of opts.catalog) {
    if (g.status === 'RELEASED') continue;
    out.push({ ...g, application: VAULT_APP_REF, is_vault: true });
  }
  for (const { ref, rows } of opts.perApplication) {
    for (const g of rows) {
      if (g.status === 'RELEASED') continue;
      out.push({ ...g, application: ref, is_vault: false });
    }
  }
  out.sort((a, b) => {
    const av = a.is_vault ? 0 : 1;
    const bv = b.is_vault ? 0 : 1;
    if (av !== bv) return av - bv;
    return (b.id ?? 0) - (a.id ?? 0);
  });
  return out;
}
