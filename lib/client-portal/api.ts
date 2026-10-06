import { api } from '@/lib/api-client';
import { config } from '@/lib/config';
import type { MobileClientSessionContext } from '@/lib/data/api';

import type { ClientKYCData } from './kyc-completion-calculator';

export type PublicRegistrationBranch = {
  id: number;
  name: string;
  code: string;
  region?: string | null;
};

export type PublicRegistrationDistrict = {
  id: number;
  name: string;
  code: string;
  zone_id: number;
  zone_name?: string | null;
};

export type PortalIndividualRegisterPayload = {
  full_name: string;
  email?: string;
  password: string;
  phone_number?: string;
  national_id: string;
  address?: string;
  branch_id?: number;
  district_id?: number;
  district_name?: string;
  client_type?: string;
  organization_name?: string;
  occupation?: string;
  employer?: string;
  monthly_income?: number;
};

export type PortalGroupRegisterPayload = {
  organization_name: string;
  email: string;
  password: string;
  phone_number?: string;
  address?: string;
  branch_id?: number;
  district_id?: number;
  district_name?: string;
};

export type ClientAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  client_id?: string;
};

type BranchesResponse = { branches?: PublicRegistrationBranch[]; detail?: string };
type DistrictsResponse = { districts?: PublicRegistrationDistrict[]; detail?: string };

async function parseJsonError(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) return `HTTP ${res.status}`;
  try {
    const data = JSON.parse(text) as { detail?: string | Array<{ msg?: string }> };
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) return data.detail[0]?.msg ?? `HTTP ${res.status}`;
    return `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function fetchPublicRegistrationBranches(): Promise<PublicRegistrationBranch[]> {
  const res = await fetch(config.clientAuth.publicRegistrationBranches);
  if (!res.ok) throw new Error(await parseJsonError(res));
  const data = (await res.json()) as BranchesResponse;
  return Array.isArray(data.branches) ? data.branches : [];
}

export async function fetchPublicRegistrationDistricts(
  branchId?: number
): Promise<PublicRegistrationDistrict[]> {
  const query =
    typeof branchId === 'number'
      ? `?branch_id=${encodeURIComponent(String(branchId))}`
      : '';
  const res = await fetch(`${config.clientAuth.publicRegistrationDistricts}${query}`);
  if (!res.ok) throw new Error(await parseJsonError(res));
  const data = (await res.json()) as DistrictsResponse;
  return Array.isArray(data.districts) ? data.districts : [];
}

export async function registerPortalIndividual(
  payload: PortalIndividualRegisterPayload
): Promise<ClientAuthTokenResponse> {
  const res = await fetch(config.clientAuth.registerIndividual, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: payload.full_name.trim(),
      email: payload.email?.trim() || undefined,
      password: payload.password,
      phone_number: payload.phone_number?.trim() || undefined,
      national_id: payload.national_id.trim(),
      address: payload.address?.trim() || undefined,
      branch_id: typeof payload.branch_id === 'number' ? payload.branch_id : undefined,
      district_id: typeof payload.district_id === 'number' ? payload.district_id : undefined,
      district_name: payload.district_name?.trim() || undefined,
      client_type: payload.client_type || undefined,
      organization_name: payload.organization_name?.trim() || undefined,
      occupation: payload.occupation?.trim() || undefined,
      employer: payload.employer?.trim() || undefined,
      monthly_income:
        typeof payload.monthly_income === 'number' ? payload.monthly_income : undefined,
    }),
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return (await res.json()) as ClientAuthTokenResponse;
}

export async function registerPortalGroup(
  payload: PortalGroupRegisterPayload
): Promise<ClientAuthTokenResponse> {
  const res = await fetch(config.clientAuth.registerGroup, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization_name: payload.organization_name.trim(),
      email: payload.email.trim(),
      password: payload.password,
      phone_number: payload.phone_number?.trim() || undefined,
      address: payload.address?.trim() || undefined,
      branch_id: typeof payload.branch_id === 'number' ? payload.branch_id : undefined,
      district_id: typeof payload.district_id === 'number' ? payload.district_id : undefined,
      district_name: payload.district_name?.trim() || undefined,
    }),
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return (await res.json()) as ClientAuthTokenResponse;
}

export async function fetchMobileKyc(token: string): Promise<ClientKYCData> {
  return api.get<ClientKYCData>('/mobile/me/kyc', token);
}

export async function saveMobileKyc(token: string, data: ClientKYCData): Promise<ClientKYCData> {
  return api.put<ClientKYCData>('/mobile/me/kyc', data, token);
}

export type KycUploadField =
  | 'profile_photo_path'
  | 'id_document_path'
  | 'id_document_back_path'
  | 'group_constitution_path'
  | 'group_photo_path';

/** Normalize upload API shapes (`path` / `key` / `url` / nested file). */
export function normalizeKycUploadPath(res: unknown): string {
  if (typeof res === 'string' && res.trim()) return res.trim();
  if (!res || typeof res !== 'object') {
    throw new Error('Upload succeeded but the server returned an empty response.');
  }
  const r = res as Record<string, unknown>;
  const nested =
    r.file && typeof r.file === 'object' ? (r.file as Record<string, unknown>) : null;
  const candidate =
    r.path ??
    r.file_path ??
    r.storage_path ??
    r.key ??
    r.url ??
    r.document_url ??
    nested?.path ??
    nested?.key ??
    nested?.url;
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error('Upload succeeded but no file path was returned.');
  }
  let path = candidate.trim();
  // Prefer storing relative upload paths so staff/client resolvers stay consistent.
  const apiHost = config.apiBase.replace(/\/api\/v1\/?$/, '');
  if (path.startsWith(apiHost + '/')) {
    path = path.slice(apiHost.length + 1);
  }
  if (path.startsWith('/')) path = path.slice(1);
  return path;
}

function mimeFromName(name: string, fallbackMime?: string): string {
  if (fallbackMime && fallbackMime !== 'application/octet-stream') return fallbackMime;
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

export async function uploadMobileKycDocument(
  token: string,
  uri: string,
  field: KycUploadField,
  fileName?: string,
  mimeType?: string
): Promise<{ path: string }> {
  const name = fileName ?? uri.split('/').pop() ?? `kyc-${Date.now()}.jpg`;
  const mime = mimeFromName(name, mimeType);

  const formData = new FormData();
  formData.append('file', { uri, name, type: mime } as unknown as Blob);
  formData.append('field', field);

  const res = await api.postForm<unknown>('/mobile/me/kyc/upload', formData, token);
  return { path: normalizeKycUploadPath(res) };
}

export async function fetchMobileSession(token: string): Promise<MobileClientSessionContext> {
  return api.get<MobileClientSessionContext>('/mobile/me/session', token);
}
