/**
 * KYC + product prefill for loan origination — mirrors cofi-bms-dashboard loan-form-client-prefill.
 * Hides fields already captured in client KYC profile; seeds product defaults (term/amount).
 */

import type { ApiCustomerProfile } from '@/lib/data/api';
import type { ClientRow } from '@/lib/data/types';
import type { ClientKYCData } from '@/lib/client-portal/kyc-completion-calculator';
import type { LoanProductRow } from '@/lib/loan-products/loan-products-cache';
import type { LoanFormField } from './types';
import {
  BORROWER_ALWAYS_VISIBLE_FIELD_KEYS,
  BORROWER_ALWAYS_VISIBLE_SECTIONS,
} from './form-fallback';
import { defaultTermMonthsForProduct } from './form-api';

function toDateInputValue(d?: string | null): string | undefined {
  if (!d) return undefined;
  const x = d.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  const dt = new Date(d);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return undefined;
}

function genderForLoanForm(g?: string | null): string | undefined {
  if (!g) return undefined;
  const u = g.trim().toUpperCase();
  if (u === 'M' || u === 'MALE') return 'Male';
  if (u === 'F' || u === 'FEMALE') return 'Female';
  return undefined;
}

const MARITAL_OPTIONS = new Set(['Single', 'Married', 'Divorced', 'Widowed']);

function maritalForLoanForm(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const t = raw.trim();
  const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  if (MARITAL_OPTIONS.has(cap)) return cap;
  const u = t.toLowerCase();
  if (u === 'single') return 'Single';
  if (u === 'married') return 'Married';
  if (u === 'divorced') return 'Divorced';
  if (u === 'widowed' || u === 'widow' || u === 'widower') return 'Widowed';
  return undefined;
}

function isBlank(v: string | number | undefined | null): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'number') return false;
  return String(v).trim() === '';
}

export function extractClientDistrictName(client: {
  district_name?: string | null;
  address?: string | null;
}): string {
  const explicit = client?.district_name;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const addr = client?.address;
  if (typeof addr === 'string' && addr.trim()) {
    const m = addr.match(/(?:^|[,;])\s*District\s*:\s*([^,;]+?)\s*$/i);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return '';
}

/** Dynamic form keys mirrored from CRM / KYC profile — not re-captured when pre-filled. */
export const LOAN_FORM_KEYS_FROM_CLIENT_PROFILE: ReadonlySet<string> = new Set([
  'full_name',
  'applicant_name',
  'client_id',
  'customer_number',
  'national_id',
  'id_number',
  'phone',
  'tel',
  'email',
  'address',
  'date_of_birth',
  'director_dob',
  'gender',
  'marital_status',
  'employer_name',
  'position',
  'monthly_income',
  'applicant_business_name',
  'organization',
  'director_email',
  'director_tel',
  'director_address',
  'director_first_name',
  'director_surname',
  'director_other_names',
  'director_gender',
  'district',
  'next_of_kin_name',
  'next_of_kin_phone',
  'next_of_kin_relationship',
]);

export const LOAN_FORM_BANK_KEYS_FROM_KYC_PROFILE: ReadonlySet<string> = new Set([
  'account_number',
  'bank_account_number',
  'account_name',
  'bank_name',
  'branch_name',
  'bank_branch',
]);

export const BORROWER_PORTAL_KYC_LOCKABLE_FIELD_KEYS: ReadonlySet<string> = new Set([
  ...Array.from(LOAN_FORM_KEYS_FROM_CLIENT_PROFILE),
  ...Array.from(LOAN_FORM_BANK_KEYS_FROM_KYC_PROFILE),
]);

/** Keys seeded / constrained from the selected loan product (re-applied when product changes). */
export const PRODUCT_DERIVED_FIELD_KEYS: ReadonlySet<string> = new Set([
  'requested_term_months',
  'term_months',
  'loan_term_months',
  'loan_duration_months',
  'loan_requested_mwk',
  'interest_rate',
  'interest_rate_percent',
  'annual_interest_rate',
  'repayment_frequency',
]);

export type PrefillCustomer = {
  name: string;
  /** CRM client code (e.g. CLI-…) from KYC / client record */
  customerNumber?: string;
  nationalId?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  dateOfBirth?: string;
  gender?: string;
  maritalStatus?: string;
  employer?: string;
  occupation?: string;
  /** Group purpose / business activities captured in KYC */
  groupPurpose?: string;
  businessActivities?: string;
  monthlyIncome?: number;
  organizationName?: string;
  clientType?: string;
  district?: string;
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinRelationship?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  bankName?: string;
  bankBranch?: string;
};

/** Prefer explicit KYC business text, then group purpose, then occupation. */
export function resolveBusinessActivitiesText(customer: PrefillCustomer): string | undefined {
  const explicit = customer.businessActivities?.trim();
  if (explicit) return explicit;
  const purpose = customer.groupPurpose?.trim();
  if (purpose) return purpose;
  const occupation = customer.occupation?.trim();
  if (occupation) return occupation;
  const employer = customer.employer?.trim();
  if (employer) return employer;
  return undefined;
}

export function mapCustomerProfileToPrefillCustomer(
  p: ApiCustomerProfile,
  _clientId: number
): PrefillCustomer {
  const g = String(p.gender ?? '').trim().toUpperCase();
  const gender = g === 'M' ? 'Male' : g === 'F' ? 'Female' : genderForLoanForm(p.gender);
  return {
    name: p.full_name,
    customerNumber:
      (typeof p.customer_number === 'string' && p.customer_number.trim()) ||
      (typeof p.client_code === 'string' && p.client_code.trim()) ||
      undefined,
    nationalId: (p.national_id ?? '').trim() || undefined,
    phoneNumber: (p.phone_number ?? '').trim() || undefined,
    email: p.email ?? undefined,
    address: (p.address ?? '').trim() || undefined,
    dateOfBirth: p.date_of_birth ?? undefined,
    gender,
    maritalStatus: p.marital_status ?? undefined,
    employer: p.employer ?? undefined,
    occupation: (p.occupation ?? '').trim() || undefined,
    monthlyIncome: p.monthly_income ?? undefined,
    organizationName: p.organization_name ?? undefined,
    clientType: p.client_type ?? undefined,
    district: extractClientDistrictName({
      district_name: (p as { district_name?: string | null }).district_name ?? null,
      address: p.address ?? null,
    }),
    nextOfKinName: p.next_of_kin_name ?? undefined,
    nextOfKinPhone: p.next_of_kin_phone ?? undefined,
    nextOfKinRelationship: p.next_of_kin_relationship ?? undefined,
    bankAccountNumber: p.bank_account_number?.trim() || undefined,
    bankAccountName: p.bank_account_name?.trim() || undefined,
    bankName: p.bank_name ?? undefined,
    bankBranch: p.bank_branch ?? undefined,
  };
}

/** Overlay /mobile/me/kyc onto a PrefillCustomer (KYC is source of truth when present). */
export function mergeClientKycIntoPrefillCustomer(
  base: PrefillCustomer,
  kyc: ClientKYCData | null | undefined
): PrefillCustomer {
  if (!kyc) return base;
  const districtFromKyc = extractClientDistrictName({
    district_name: null,
    address: kyc.address ?? null,
  });
  return {
    ...base,
    nationalId: kyc.national_id?.trim() || base.nationalId,
    phoneNumber: kyc.phone_number?.trim() || base.phoneNumber,
    email: kyc.email?.trim() || base.email,
    address: kyc.address?.trim() || base.address,
    dateOfBirth: kyc.date_of_birth || base.dateOfBirth,
    gender: genderForLoanForm(kyc.gender) || base.gender,
    maritalStatus: kyc.marital_status || base.maritalStatus,
    employer: kyc.employer?.trim() || base.employer,
    occupation: kyc.occupation?.trim() || base.occupation,
    groupPurpose: kyc.group_purpose?.trim() || base.groupPurpose,
    businessActivities:
      kyc.group_purpose?.trim() ||
      kyc.occupation?.trim() ||
      base.businessActivities,
    monthlyIncome: kyc.monthly_income ?? base.monthlyIncome,
    organizationName:
      (String(kyc.client_type || '').toUpperCase() === 'GROUP' && kyc.employer?.trim()) ||
      base.organizationName,
    clientType: kyc.client_type?.trim() || base.clientType,
    district: districtFromKyc || base.district,
    nextOfKinName: kyc.next_of_kin_name?.trim() || base.nextOfKinName,
    nextOfKinPhone: kyc.next_of_kin_phone?.trim() || base.nextOfKinPhone,
    nextOfKinRelationship: kyc.next_of_kin_relationship?.trim() || base.nextOfKinRelationship,
    bankAccountNumber: kyc.bank_account_number?.trim() || base.bankAccountNumber,
    bankAccountName: kyc.bank_account_name?.trim() || base.bankAccountName,
    bankName: kyc.bank_name?.trim() || base.bankName,
    bankBranch: kyc.bank_branch?.trim() || base.bankBranch,
  };
}

export function mapClientRowToPrefillCustomer(row: ClientRow): PrefillCustomer {
  const g = String(row.gender ?? '').trim().toUpperCase();
  const gender = g === 'M' ? 'Male' : g === 'F' ? 'Female' : genderForLoanForm(row.gender);
  return {
    name: row.name,
    customerNumber: row.customer_number?.trim() || undefined,
    nationalId: row.national_id?.trim() || undefined,
    phoneNumber: row.phone_number?.trim() || undefined,
    email: row.email ?? undefined,
    address: row.address?.trim() || undefined,
    dateOfBirth: row.date_of_birth ?? undefined,
    gender,
    maritalStatus: row.marital_status ?? undefined,
    employer: row.employer?.trim() || undefined,
    occupation: row.occupation?.trim() || undefined,
    businessActivities: row.occupation?.trim() || undefined,
    monthlyIncome: row.monthly_income ?? undefined,
    organizationName: row.organization_name?.trim() || undefined,
    clientType: row.client_type?.trim() || undefined,
    district: extractClientDistrictName({
      district_name: row.district_name ?? null,
      address: row.address ?? null,
    }),
    nextOfKinName: row.next_of_kin_name?.trim() || undefined,
    nextOfKinPhone: row.next_of_kin_phone?.trim() || undefined,
    nextOfKinRelationship: row.next_of_kin_relationship?.trim() || undefined,
    bankAccountNumber: row.bank_account_number?.trim() || undefined,
    bankAccountName: row.bank_account_name?.trim() || undefined,
    bankName: row.bank_name?.trim() || undefined,
    bankBranch: row.bank_branch?.trim() || undefined,
  };
}

export function buildLoanFormPrefillFromCustomer(
  customer: PrefillCustomer,
  fields: LoanFormField[]
): Record<string, string | number> {
  const keys = new Set(fields.map((f) => f.key));
  const typeByKey = Object.fromEntries(fields.map((f) => [f.key, f.type])) as Record<string, string>;
  const out: Record<string, string | number> = {};

  const put = (formKey: string, value: string | number | undefined | null) => {
    if (!keys.has(formKey) || value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    const t = typeByKey[formKey];
    if (t === 'number' && typeof value === 'string') {
      const n = parseInt(value.replace(/,/g, ''), 10);
      if (!isNaN(n)) out[formKey] = n;
      return;
    }
    if (t === 'number' && typeof value === 'number') {
      out[formKey] = value;
      return;
    }
    out[formKey] = value as string | number;
  };

  const dob = toDateInputValue(customer.dateOfBirth);

  put('full_name', customer.name);
  put('applicant_name', customer.name);
  put('client_id', customer.customerNumber);
  put('customer_number', customer.customerNumber);
  put('national_id', customer.nationalId);
  put('id_number', customer.nationalId);
  put('phone', customer.phoneNumber);
  put('tel', customer.phoneNumber);
  put('email', customer.email);
  put('address', customer.address);
  put('date_of_birth', dob);
  put('director_dob', dob);
  put('gender', customer.gender ?? genderForLoanForm(customer.gender));
  put('marital_status', maritalForLoanForm(customer.maritalStatus));
  put('employer_name', customer.employer);
  put('position', customer.occupation);
  if (customer.monthlyIncome != null && customer.monthlyIncome > 0) {
    put('monthly_income', customer.monthlyIncome);
  }
  const businessText = resolveBusinessActivitiesText(customer);
  put('business_activities', businessText);
  // Agricultural forms: seed crops from occupation / group purpose when present.
  put('crops', businessText);
  const rawType = String(customer.clientType || '').toUpperCase();
  const isEntityBorrower =
    rawType === 'GROUP' ||
    rawType === 'COOPERATIVE' ||
    rawType === 'SME' ||
    rawType === 'BUSINESS';
  const businessLabel =
    customer.organizationName?.trim() ||
    (isEntityBorrower ? customer.name?.trim() : undefined);
  put('applicant_business_name', businessLabel);
  put('organization', customer.organizationName?.trim() || (isEntityBorrower ? customer.name : undefined) || customer.name);
  put('director_email', customer.email);
  put('director_tel', customer.phoneNumber);
  put('director_address', customer.address);
  if (customer.gender === 'Male') put('director_gender', 'M');
  else if (customer.gender === 'Female') put('director_gender', 'F');

  const rawPersonName = (customer.name || '').trim();
  if (rawPersonName) {
    const parts = rawPersonName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      put('director_first_name', parts[0]);
      put('director_surname', parts[parts.length - 1]);
      if (parts.length > 2) put('director_other_names', parts.slice(1, -1).join(' '));
    } else if (parts.length === 1) {
      put('director_first_name', parts[0]);
    }
  }

  if (customer.district?.trim()) put('district', customer.district);
  put('next_of_kin_name', customer.nextOfKinName);
  put('next_of_kin_phone', customer.nextOfKinPhone);
  put('next_of_kin_relationship', customer.nextOfKinRelationship);

  const accountNumber = customer.bankAccountNumber?.trim();
  const accountName = customer.bankAccountName?.trim() || customer.name;
  if (accountNumber) {
    put('account_number', accountNumber);
    put('bank_account_number', accountNumber);
  }
  if (accountName) put('account_name', accountName);
  put('bank_name', customer.bankName?.trim());
  put('branch_name', customer.bankBranch?.trim());
  put('bank_branch', customer.bankBranch?.trim());

  return out;
}

/**
 * Seed form values from the selected loan product (term, amount floor, rate, frequency).
 * Returns prefill values + keys that should be read-only when the product fixes them.
 */
export function composeProductFormPrefill(args: {
  product?: Pick<
    LoanProductRow,
    | 'minimum_amount'
    | 'maximum_amount'
    | 'minimum_term_months'
    | 'maximum_term_months'
    | 'interest_rate'
    | 'repayment_frequency'
  > | null;
  fields: LoanFormField[];
}): { prefill: Record<string, string | number>; lockKeys: Set<string> } {
  const { product, fields } = args;
  const keys = new Set(fields.map((f) => f.key));
  const out: Record<string, string | number> = {};
  const lockKeys = new Set<string>();
  if (!product) return { prefill: out, lockKeys };

  const termDefault = defaultTermMonthsForProduct(product);
  for (const key of [
    'requested_term_months',
    'term_months',
    'loan_term_months',
    'loan_duration_months',
  ]) {
    if (keys.has(key) && termDefault > 0) out[key] = termDefault;
  }

  const minTerm = product.minimum_term_months ?? 0;
  const maxTerm = product.maximum_term_months ?? 0;
  if (minTerm > 0 && maxTerm > 0 && minTerm === maxTerm) {
    for (const key of [
      'requested_term_months',
      'term_months',
      'loan_term_months',
      'loan_duration_months',
    ]) {
      if (keys.has(key)) lockKeys.add(key);
    }
  }

  const minAmount = product.minimum_amount ?? 0;
  const maxAmount = product.maximum_amount ?? 0;
  if (keys.has('loan_requested_mwk') && minAmount > 0) {
    out.loan_requested_mwk = minAmount;
  }
  if (minAmount > 0 && maxAmount > 0 && minAmount === maxAmount) {
    if (keys.has('loan_requested_mwk')) lockKeys.add('loan_requested_mwk');
  }

  // interest_rate on products is basis points (e.g. 2400 = 24%). Prefer percent keys when present.
  const bp = product.interest_rate;
  if (bp != null && bp >= 0) {
    const percent = Math.round((bp / 100) * 100) / 100;
    if (keys.has('interest_rate_percent')) {
      out.interest_rate_percent = percent;
      lockKeys.add('interest_rate_percent');
    }
    if (keys.has('annual_interest_rate')) {
      out.annual_interest_rate = percent;
      lockKeys.add('annual_interest_rate');
    }
    if (keys.has('interest_rate')) {
      out.interest_rate = bp >= 100 ? percent : bp;
      lockKeys.add('interest_rate');
    }
  }

  const freq = product.repayment_frequency?.trim();
  if (freq && keys.has('repayment_frequency')) {
    out.repayment_frequency = freq;
    lockKeys.add('repayment_frequency');
  }

  return { prefill: out, lockKeys };
}

export function composeLoanFormAutoPrefill(args: {
  customer?: PrefillCustomer | null;
  fields: LoanFormField[];
  defaultTermMonths?: number;
  product?: Parameters<typeof composeProductFormPrefill>[0]['product'];
}): Record<string, string | number> {
  const { customer, fields, defaultTermMonths, product } = args;
  const out: Record<string, string | number> = {};

  if (customer) {
    Object.assign(out, buildLoanFormPrefillFromCustomer(customer, fields));
  }

  if (product) {
    Object.assign(out, composeProductFormPrefill({ product, fields }).prefill);
  } else if (defaultTermMonths && defaultTermMonths > 0) {
    const keys = new Set(fields.map((f) => f.key));
    for (const key of [
      'requested_term_months',
      'term_months',
      'loan_term_months',
      'loan_duration_months',
    ]) {
      if (keys.has(key)) out[key] = defaultTermMonths;
    }
  }

  return out;
}

export function computeBorrowerKycPrefill(args: {
  profile: ApiCustomerProfile;
  clientId: number;
  fields: LoanFormField[];
  termDefault: number;
  kyc?: ClientKYCData | null;
  product?: Parameters<typeof composeProductFormPrefill>[0]['product'];
}): { prefill: Record<string, string | number>; lockKeys: Set<string> } {
  let customer = mapCustomerProfileToPrefillCustomer(args.profile, args.clientId);
  customer = mergeClientKycIntoPrefillCustomer(customer, args.kyc);
  const prefill = composeLoanFormAutoPrefill({
    customer,
    fields: args.fields,
    defaultTermMonths: args.termDefault,
    product: args.product,
  });
  const lockKeys = new Set<string>();
  for (const k of Object.keys(prefill)) {
    if (BORROWER_PORTAL_KYC_LOCKABLE_FIELD_KEYS.has(k)) lockKeys.add(k);
  }
  const productLocks = composeProductFormPrefill({
    product: args.product,
    fields: args.fields,
  }).lockKeys;
  productLocks.forEach((k) => lockKeys.add(k));
  return { prefill, lockKeys };
}

/** Staff mode: full KYC prefill from client row + product defaults. */
export function computeStaffBorrowerPrefill(args: {
  client: ClientRow;
  fields: LoanFormField[];
  termDefault: number;
  product?: Parameters<typeof composeProductFormPrefill>[0]['product'];
}): { prefill: Record<string, string | number>; lockKeys: Set<string> } {
  const customer = mapClientRowToPrefillCustomer(args.client);
  const prefill = composeLoanFormAutoPrefill({
    customer,
    fields: args.fields,
    defaultTermMonths: args.termDefault,
    product: args.product,
  });
  const lockKeys = new Set<string>();
  for (const k of Object.keys(prefill)) {
    if (BORROWER_PORTAL_KYC_LOCKABLE_FIELD_KEYS.has(k)) lockKeys.add(k);
  }
  const productLocks = composeProductFormPrefill({
    product: args.product,
    fields: args.fields,
  }).lockKeys;
  productLocks.forEach((k) => lockKeys.add(k));
  return { prefill, lockKeys };
}

/** Staff mode: hide profile + bank fields that were prefilled from KYC. */
export function filterSchemaFieldsForStaffBorrower(
  fields: LoanFormField[],
  hasSelectedBorrower: boolean,
  lockKeys?: ReadonlySet<string>
): LoanFormField[] {
  if (!hasSelectedBorrower) return fields;
  return fields.filter((f) => {
    if (lockKeys?.has(f.key) && BORROWER_PORTAL_KYC_LOCKABLE_FIELD_KEYS.has(f.key)) return false;
    if (LOAN_FORM_KEYS_FROM_CLIENT_PROFILE.has(f.key)) return false;
    if (LOAN_FORM_BANK_KEYS_FROM_KYC_PROFILE.has(f.key) && lockKeys?.has(f.key)) return false;
    return true;
  });
}

/** Client mode: hide KYC-prefilled profile fields; always keep loan-specific sections visible. */
export function filterSchemaFieldsForClientPortal(
  fields: LoanFormField[],
  lockKeys: ReadonlySet<string>
): LoanFormField[] {
  return fields.filter((f) => {
    if (BORROWER_ALWAYS_VISIBLE_SECTIONS.has(f.section)) return true;
    if (BORROWER_ALWAYS_VISIBLE_FIELD_KEYS.has(f.key)) return true;
    return !lockKeys.has(f.key);
  });
}

/**
 * Merge prefill into existing values.
 * Product-derived keys are always overwritten so switching products updates term/amount.
 * KYC keys only fill blanks (never clobber user edits).
 */
export function mergePrefillIntoExistingValues(
  prefill: Record<string, string | number>,
  prev: Record<string, string | number>,
  opts?: { forceKeys?: ReadonlySet<string> }
): Record<string, string | number> {
  const forceKeys = opts?.forceKeys ?? PRODUCT_DERIVED_FIELD_KEYS;
  const next = { ...prev };
  for (const [k, v] of Object.entries(prefill)) {
    const cur = next[k];
    if (forceKeys.has(k) || isBlank(cur)) next[k] = v;
  }
  return next;
}
