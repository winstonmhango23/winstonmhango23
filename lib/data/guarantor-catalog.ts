/**
 * Client-linked guarantor catalog.
 *
 * Borrowers manage their catalog via /mobile/me/guarantor-catalog.
 * Staff discover a borrower's guarantors via /clients/guarantors (with fallbacks),
 * instead of picking from the entire clients directory.
 */

import { api, ApiClientError } from '@/lib/api-client';
import { config } from '@/lib/config';
import type { ApiGuarantor, BorrowerGuarantorInput } from '@/lib/data/api';

export type GuarantorCatalogEntry = ApiGuarantor & {
  /** Some backends nest the linked registered-client id differently. */
  linked_client_id?: number | null;
  borrower_client_id?: number | null;
};

export type GuarantorCatalogInput = {
  full_name: string;
  client_id?: number;
  national_id?: string;
  email?: string;
  phone_number?: string;
  address?: string;
  relationship_to_borrower?: string;
  occupation?: string;
  monthly_income?: number;
  guarantee_amount?: number;
};

/** Normalize list/envelope responses from catalog endpoints. */
export function normalizeGuarantorCatalogResponse(res: unknown): GuarantorCatalogEntry[] {
  if (!res) return [];
  if (Array.isArray(res)) return res as GuarantorCatalogEntry[];
  if (typeof res !== 'object') return [];
  const obj = res as Record<string, unknown>;
  for (const key of ['items', 'guarantors', 'data', 'results', 'catalog'] as const) {
    const value = obj[key];
    if (Array.isArray(value)) return value as GuarantorCatalogEntry[];
  }
  return [];
}

export function catalogEntryDisplayName(entry: GuarantorCatalogEntry): string {
  return String(entry.full_name ?? '').trim() || 'Guarantor';
}

export function catalogEntryLinkedClientId(entry: GuarantorCatalogEntry): number | undefined {
  const candidates = [entry.client_id, entry.linked_client_id];
  for (const c of candidates) {
    if (typeof c === 'number') {
      if (Number.isFinite(c) && c > 0) return c;
      continue;
    }
    if (typeof c === 'string' && /^\d+$/.test(c.trim())) {
      const n = Number(c.trim());
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

/** Trim optional text fields; coerce numbers so alphanumeric national IDs never hit `.trim()` on non-strings. */
export function trimGuarantorTextField(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

/** Build application/loan guarantor payload from a catalog row + optional overrides. */
export function buildGuarantorPayloadFromCatalog(
  entry: GuarantorCatalogEntry,
  overrides?: Partial<GuarantorCatalogInput> & { guaranteed_for_client_id?: number }
): BorrowerGuarantorInput {
  const linked = catalogEntryLinkedClientId(entry);
  const fullName = (overrides?.full_name ?? entry.full_name ?? '').trim();
  const payload: BorrowerGuarantorInput = {
    full_name: fullName,
  };
  if (linked) payload.client_id = linked;
  const nationalId = trimGuarantorTextField(overrides?.national_id ?? entry.national_id);
  const email = trimGuarantorTextField(overrides?.email ?? entry.email);
  const phone = trimGuarantorTextField(overrides?.phone_number ?? entry.phone_number);
  const address = trimGuarantorTextField(overrides?.address ?? entry.address);
  const relationship = trimGuarantorTextField(
    overrides?.relationship_to_borrower ?? entry.relationship_to_borrower
  );
  const occupation = trimGuarantorTextField(overrides?.occupation ?? entry.occupation);
  const income = overrides?.monthly_income ?? entry.monthly_income;
  const amount = overrides?.guarantee_amount ?? entry.guarantee_amount;
  if (nationalId) payload.national_id = nationalId;
  if (email) payload.email = email;
  if (phone) payload.phone_number = phone;
  if (address) payload.address = address;
  if (relationship) payload.relationship_to_borrower = relationship;
  if (occupation) payload.occupation = occupation;
  if (income != null && income > 0) payload.monthly_income = income;
  if (amount != null && amount > 0) payload.guarantee_amount = amount;
  if (overrides?.guaranteed_for_client_id != null && overrides.guaranteed_for_client_id > 0) {
    payload.guaranteed_for_client_id = overrides.guaranteed_for_client_id;
  }
  return payload;
}

/** Build POST/PUT body for guarantor catalog endpoints (staff + borrower). */
export function buildGuarantorCatalogBody(
  input: GuarantorCatalogInput,
  borrowerClientId?: number
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    full_name: String(input.full_name).trim(),
  };
  // Borrower who owns this catalog row — NOT the guarantor's linked client id.
  if (borrowerClientId != null && borrowerClientId > 0) {
    body.catalog_owner_client_id = borrowerClientId;
  }
  // Optional registered client record for the guarantor (numeric PK only).
  if (input.client_id != null && input.client_id > 0) {
    body.client_id = input.client_id;
  }
  const nationalId = trimGuarantorTextField(input.national_id);
  const email = trimGuarantorTextField(input.email);
  const phone = trimGuarantorTextField(input.phone_number);
  const address = trimGuarantorTextField(input.address);
  const relationship = trimGuarantorTextField(input.relationship_to_borrower);
  const occupation = trimGuarantorTextField(input.occupation);
  if (nationalId) body.national_id = nationalId;
  if (email) body.email = email;
  if (phone) body.phone_number = phone;
  if (address) body.address = address;
  if (relationship) body.relationship_to_borrower = relationship;
  if (occupation) body.occupation = occupation;
  if (input.monthly_income != null && input.monthly_income > 0) {
    body.monthly_income = input.monthly_income;
  }
  if (input.guarantee_amount != null && input.guarantee_amount > 0) {
    body.guarantee_amount = input.guarantee_amount;
  }
  return body;
}

function catalogBody(input: GuarantorCatalogInput, borrowerClientId?: number): Record<string, unknown> {
  return buildGuarantorCatalogBody(input, borrowerClientId);
}

export async function apiGetBorrowerGuarantorCatalog(
  token: string
): Promise<GuarantorCatalogEntry[]> {
  const res = await api.get<unknown>(config.mobile.guarantorCatalog, token);
  return normalizeGuarantorCatalogResponse(res);
}

export async function apiAddBorrowerGuarantorCatalog(
  token: string,
  input: GuarantorCatalogInput
): Promise<GuarantorCatalogEntry> {
  return api.post<GuarantorCatalogEntry>(
    config.mobile.guarantorCatalog,
    catalogBody(input),
    token
  );
}

async function tryGetStaffCatalog(
  token: string,
  path: string
): Promise<GuarantorCatalogEntry[] | null> {
  try {
    const res = await api.get<unknown>(path, token);
    return normalizeGuarantorCatalogResponse(res);
  } catch (e) {
    if (e instanceof ApiClientError && (e.status === 404 || e.status === 405)) return null;
    if (e instanceof ApiClientError && e.status === 401) throw e;
    // Other authz/validation errors — try next candidate.
    if (e instanceof ApiClientError && e.status >= 400 && e.status < 500) return null;
    throw e;
  }
}

/**
 * Staff: list guarantors already attached to a borrower/client.
 * Tries known catalog endpoints in preference order.
 */
export async function apiGetStaffClientGuarantors(
  token: string,
  borrowerClientId: number
): Promise<GuarantorCatalogEntry[]> {
  if (!Number.isFinite(borrowerClientId) || borrowerClientId <= 0) return [];
  const id = encodeURIComponent(String(borrowerClientId));
  // Prefer the canonical profiles endpoint; keep short aliases for older deploys.
  const candidates = [
    `/loans/guarantors/profiles?catalog_owner_client_id=${id}`,
    `/clients/guarantors?client_id=${id}`,
    `/clients/${id}/guarantors`,
    `/staff/guarantor-catalog?client_id=${id}`,
  ];
  for (const path of candidates) {
    const rows = await tryGetStaffCatalog(token, path);
    if (rows) return rows;
  }
  return [];
}

async function tryWriteStaffCatalog(
  token: string,
  method: 'PUT' | 'POST',
  path: string,
  body: Record<string, unknown>
): Promise<GuarantorCatalogEntry | null> {
  try {
    if (method === 'PUT') {
      return await api.put<GuarantorCatalogEntry>(path, body, token);
    }
    return await api.post<GuarantorCatalogEntry>(path, body, token);
  } catch (e) {
    if (e instanceof ApiClientError && (e.status === 404 || e.status === 405)) return null;
    throw e;
  }
}

/**
 * Staff: create/update a guarantor on the borrower's catalog when the API allows it.
 * Returns null when the catalog write endpoints are unavailable (attach-only flow still works).
 */
export async function apiUpsertStaffClientGuarantor(
  token: string,
  borrowerClientId: number,
  input: GuarantorCatalogInput
): Promise<GuarantorCatalogEntry | null> {
  const body = catalogBody(input, borrowerClientId);
  const id = encodeURIComponent(String(borrowerClientId));
  const candidates: Array<{ method: 'PUT' | 'POST'; path: string }> = [
    { method: 'POST', path: '/loans/guarantors/profiles' },
    // Legacy alias on older deployments (GET-only on current API — fast 404/405 fallback).
    { method: 'POST', path: `/staff/guarantor-catalog?client_id=${id}` },
  ];
  for (const c of candidates) {
    const created = await tryWriteStaffCatalog(token, c.method, c.path, body);
    if (created) return created;
  }
  return null;
}
