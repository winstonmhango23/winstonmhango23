/**
 * Bundled loan form templates — used when the API returns empty fields or the request fails.
 * Mirrors cofi-bms-dashboard/lib/loan-form-fallback.ts (keep in sync with loan-form-schema.json).
 */

import { inferFormTypeFromProduct } from '@/lib/loan-product-context';

import type { LoanFormField, LoanFormSchema } from './types';

import schemaJson from './loan-form-schema.json';

export type LoanFormTypeKey = 'SME' | 'INDIVIDUAL' | 'AGRICULTURAL';

type FormTypesFile = {
  form_types: Record<
    string,
    {
      label: string;
      sections: Array<{ key: string; label: string }>;
      fields: Array<Record<string, unknown>>;
    }
  >;
};

const FORM_TYPES = (schemaJson as FormTypesFile).form_types;

export function inferFormTypeKey(
  category?: string | null,
  productName?: string | null
): LoanFormTypeKey {
  const ft = inferFormTypeFromProduct(category ?? undefined, productName ?? undefined);
  if (ft === 'SME' || ft === 'AGRICULTURAL') return ft;
  return 'INDIVIDUAL';
}

function normalizeFields(raw: Array<Record<string, unknown>>): LoanFormField[] {
  const out: LoanFormField[] = [];
  for (const row of raw) {
    const key = typeof row.key === 'string' ? row.key : '';
    const label = typeof row.label === 'string' ? row.label : key;
    const type = typeof row.type === 'string' ? row.type : 'text';
    const section = typeof row.section === 'string' ? row.section : 'other';
    if (!key) continue;
    out.push({
      key,
      label,
      type,
      section,
      required: row.required === true,
      options: Array.isArray(row.options) ? (row.options as string[]) : undefined,
      visible_when:
        row.visible_when && typeof row.visible_when === 'object'
          ? (row.visible_when as LoanFormField['visible_when'])
          : undefined,
    });
  }
  return out;
}

/** Merge API body with bundled templates when fields are missing. */
export function resolveLoanFormPayload(
  apiData: unknown,
  opts: { category?: string | null; productName?: string | null; formType?: string | null }
): LoanFormSchema {
  const hint = (opts.formType || inferFormTypeKey(opts.category, opts.productName)).toUpperCase() as LoanFormTypeKey;
  const raw = apiData as {
    fields?: unknown[];
    form_type?: string;
    label?: string;
    sections?: LoanFormSchema['sections'];
  };

  if (Array.isArray(raw?.fields) && raw.fields.length > 0) {
    return {
      form_type: raw.form_type || hint,
      label: raw.label || hint,
      sections: raw.sections ?? [],
      fields: normalizeFields(raw.fields as Array<Record<string, unknown>>),
    };
  }

  const tmpl = FORM_TYPES[hint] || FORM_TYPES.INDIVIDUAL;
  return {
    form_type: hint,
    label: tmpl.label,
    sections: tmpl.sections,
    fields: normalizeFields(tmpl.fields),
  };
}

/** Loan-specific fields that must stay visible on the borrower portal even when KYC prefill hides profile fields. */
export const BORROWER_ALWAYS_VISIBLE_SECTIONS: ReadonlySet<string> = new Set([
  'loan',
  'agric',
  'financials',
  'referrer',
]);

export const BORROWER_ALWAYS_VISIBLE_FIELD_KEYS: ReadonlySet<string> = new Set([
  'loan_requested_mwk',
  'requested_term_months',
  'loan_purpose',
  'loan_purpose_other',
  'maturity_date',
  'proposed_collateral',
  'repayment_method',
  'loan_cycle',
  'season',
  'land_size_hectares',
  'crops',
  'business_activities',
  'annual_turnover_mwk',
  'projected_net_profit_mwk',
]);
