import type { KycUploadField } from '@/lib/client-portal/api';
import type { ClientKYCData } from '@/lib/client-portal/kyc-completion-calculator';
import {
  isOrganizationKycClientType,
  sanitizeKycPayloadForClientType,
  toDateInputValue,
} from '@/lib/client-portal/kyc-data-normalizer';
import type { ApiClientUpdate } from '@/lib/data/api';
import * as api from '@/lib/data/api';

const KYC_DOC_FIELDS: KycUploadField[] = [
  'profile_photo_path',
  'id_document_path',
  'id_document_back_path',
  'group_constitution_path',
  'group_photo_path',
];

function trimOrUndef(v: string | null | undefined): string | undefined {
  const s = String(v ?? '').trim();
  return s ? s : undefined;
}

function toApiDate(value?: string | null): string | undefined {
  const d = toDateInputValue(value);
  return d ? `${d}T00:00:00Z` : undefined;
}

function isLocalUploadUri(uri?: string | null): boolean {
  return !!uri && (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://'));
}

/** Backend finished-profile errors that incorrectly list personal KYC for org clients. */
export function isPersonalKycRequiredError(message: string): boolean {
  const m = message.toLowerCase();
  if (!m.includes('missing')) return false;
  return (
    m.includes('national id') ||
    m.includes('date of birth') ||
    m.includes('id document') ||
    m.includes('gender') ||
    m.includes('occupation')
  );
}

export type StaffKycApplyOptions = {
  saveMode: 'draft' | 'finished';
  districtId?: number | null;
  clientType: string;
  fullName: string;
};

/**
 * Personal identity fields that must not remain on GROUP/COOPERATIVE profiles.
 * Sent as null on org updates so the API clears stale individual KYC.
 */
function orgClearedPersonalFields(): Pick<
  ApiClientUpdate,
  | 'national_id'
  | 'date_of_birth'
  | 'gender'
  | 'marital_status'
  | 'occupation'
  | 'next_of_kin_name'
  | 'next_of_kin_phone'
  | 'next_of_kin_relationship'
  | 'profile_photo_path'
  | 'id_document_path'
  | 'id_document_back_path'
> {
  return {
    national_id: null,
    date_of_birth: null,
    gender: null,
    marital_status: null,
    occupation: null,
    next_of_kin_name: null,
    next_of_kin_phone: null,
    next_of_kin_relationship: null,
    profile_photo_path: null,
    id_document_path: null,
    id_document_back_path: null,
  };
}

export function buildStaffClientUpdateBody(
  kyc: ClientKYCData,
  docPaths: Partial<Record<KycUploadField, string | null | undefined>>,
  options: StaffKycApplyOptions
): ApiClientUpdate {
  const clientType = options.clientType.toUpperCase();
  const isOrg = isOrganizationKycClientType(clientType);
  const sanitized = sanitizeKycPayloadForClientType({ ...kyc, client_type: clientType });

  const body: ApiClientUpdate = {
    full_name: options.fullName.trim(),
    client_type: clientType,
    save_mode: options.saveMode,
    email: trimOrUndef(sanitized.email),
    phone_number: trimOrUndef(sanitized.phone_number),
    address: trimOrUndef(sanitized.address),
    employer: trimOrUndef(sanitized.employer),
    monthly_income:
      typeof sanitized.monthly_income === 'number' && sanitized.monthly_income > 0
        ? sanitized.monthly_income
        : undefined,
    bank_account_number: trimOrUndef(sanitized.bank_account_number),
    bank_account_name: trimOrUndef(sanitized.bank_account_name),
    bank_name: trimOrUndef(sanitized.bank_name),
    bank_branch: trimOrUndef(sanitized.bank_branch),
    community_type: trimOrUndef(sanitized.community_type),
    village_head: trimOrUndef(sanitized.village_head),
    village_head_phone: trimOrUndef(sanitized.village_head_phone),
    is_verified: options.saveMode === 'finished',
    district_id:
      typeof options.districtId === 'number' && options.districtId > 0
        ? options.districtId
        : undefined,
  };

  if (isOrg) {
    Object.assign(body, orgClearedPersonalFields());
    body.organization_name = options.fullName.trim();
    body.registration_number = trimOrUndef(sanitized.registration_number);
    body.registration_date = toApiDate(sanitized.registration_date);
    body.meeting_schedule = trimOrUndef(sanitized.meeting_schedule);
    body.group_purpose = trimOrUndef(sanitized.group_purpose);
    body.member_count =
      typeof sanitized.member_count === 'number' && sanitized.member_count > 0
        ? sanitized.member_count
        : undefined;
    body.chairperson_name = trimOrUndef(sanitized.chairperson_name);
    body.chairperson_phone = trimOrUndef(sanitized.chairperson_phone);
    body.secretary_name = trimOrUndef(sanitized.secretary_name);
    body.secretary_phone = trimOrUndef(sanitized.secretary_phone);
    body.treasurer_name = trimOrUndef(sanitized.treasurer_name);
    body.treasurer_phone = trimOrUndef(sanitized.treasurer_phone);
    const constitutionPath =
      docPaths.group_constitution_path ?? sanitized.group_constitution_path;
    if (constitutionPath && !isLocalUploadUri(constitutionPath)) {
      body.group_constitution_path = constitutionPath;
    }
    const groupPhotoPath = docPaths.group_photo_path ?? sanitized.group_photo_path;
    if (groupPhotoPath && !isLocalUploadUri(groupPhotoPath)) {
      body.group_photo_path = groupPhotoPath;
    }
    return body;
  }

  // INDIVIDUAL + SME (and other personal KYC types)
  body.national_id = trimOrUndef(sanitized.national_id);
  body.date_of_birth = toApiDate(sanitized.date_of_birth);
  body.gender = trimOrUndef(sanitized.gender);
  body.marital_status = trimOrUndef(sanitized.marital_status);
  body.occupation = trimOrUndef(sanitized.occupation);
  body.next_of_kin_name = trimOrUndef(sanitized.next_of_kin_name);
  body.next_of_kin_phone = trimOrUndef(sanitized.next_of_kin_phone);
  body.next_of_kin_relationship = trimOrUndef(sanitized.next_of_kin_relationship);
  const profilePath = docPaths.profile_photo_path ?? sanitized.profile_photo_path;
  const idPath = docPaths.id_document_path ?? sanitized.id_document_path;
  const idBackPath = docPaths.id_document_back_path ?? sanitized.id_document_back_path;
  if (profilePath && !isLocalUploadUri(profilePath)) body.profile_photo_path = profilePath;
  if (idPath && !isLocalUploadUri(idPath)) body.id_document_path = idPath;
  if (idBackPath && !isLocalUploadUri(idBackPath)) body.id_document_back_path = idBackPath;

  // SME also carries community / org metadata used by village SME flows.
  if (clientType === 'SME') {
    body.organization_name = options.fullName.trim();
    body.registration_number = trimOrUndef(kyc.registration_number);
    body.registration_date = toApiDate(kyc.registration_date);
  }

  return body;
}

export async function uploadStaffKycLocalDocuments(
  token: string,
  clientId: string,
  kyc: ClientKYCData,
  localPreviews: Partial<Record<KycUploadField, string>>
): Promise<Partial<Record<KycUploadField, string>>> {
  const uploaded: Partial<Record<KycUploadField, string>> = {};

  for (const field of KYC_DOC_FIELDS) {
    const localUri = localPreviews[field];
    const serverPath = kyc[field as keyof ClientKYCData] as string | null | undefined;
    if (localUri && isLocalUploadUri(localUri)) {
      const res = await api.apiStaffUploadKycDocument(token, clientId, localUri, field);
      uploaded[field] = res.path;
      continue;
    }
    if (serverPath && !isLocalUploadUri(serverPath) && !serverPath.startsWith('queued:')) {
      uploaded[field] = serverPath;
    }
  }

  return uploaded;
}

/**
 * Apply staff KYC. For organization clients marked finished, persist type + org fields
 * first (draft), then mark verified — avoids API validating individual KYC against the
 * previous client_type before GROUP/COOPERATIVE is applied.
 */
export async function applyStaffClientKycUpdate(
  token: string,
  clientId: string,
  kyc: ClientKYCData,
  localPreviews: Partial<Record<KycUploadField, string>>,
  options: StaffKycApplyOptions
): Promise<void> {
  const docPaths = await uploadStaffKycLocalDocuments(token, clientId, kyc, localPreviews);
  const isOrg = isOrganizationKycClientType(options.clientType);

  if (isOrg && options.saveMode === 'finished') {
    const draftBody = buildStaffClientUpdateBody(kyc, docPaths, {
      ...options,
      saveMode: 'draft',
    });
    await api.apiPutStaffClientProfile(token, clientId, draftBody);

    const finishedBody = buildStaffClientUpdateBody(kyc, docPaths, options);
    try {
      await api.apiPutStaffClientProfile(token, clientId, finishedBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isPersonalKycRequiredError(message)) throw err;
      // Some API builds still gate /verify-style finished checks on personal fields.
      // After org type is persisted, mark verified via the dedicated endpoint.
      const numId = parseInt(clientId, 10);
      if (Number.isNaN(numId)) throw err;
      await api.apiVerifyClient(token, numId);
    }
    return;
  }

  const body = buildStaffClientUpdateBody(kyc, docPaths, options);
  await api.apiPutStaffClientProfile(token, clientId, body);
}

/**
 * Ensure organization client_type (GROUP/COOPERATIVE) is on the server, clear
 * personal KYC leftovers, then verify. API finished-profile validation must use
 * organization field requirements for these types (not national ID / DOB / ID doc).
 * Falls back to PUT is_verified when an older API build still demands personal fields.
 */
export async function verifyStaffClientWithOrgKycGuard(
  token: string,
  clientId: string,
  client: {
    name?: string | null;
    client_type?: string | null;
    group_constitution_uri?: string | null;
  }
): Promise<void> {
  const rawType = String(client.client_type || '').toUpperCase();
  const inferredOrg =
    isOrganizationKycClientType(rawType) ||
    (!rawType && Boolean(client.group_constitution_uri));
  const clientType = inferredOrg
    ? rawType === 'COOPERATIVE'
      ? 'COOPERATIVE'
      : rawType === 'GROUP' || !rawType
        ? 'GROUP'
        : rawType
    : rawType || 'INDIVIDUAL';

  const numId = parseInt(clientId, 10);
  if (Number.isNaN(numId)) throw new Error('Invalid client ID');

  if (!isOrganizationKycClientType(clientType)) {
    await api.apiVerifyClient(token, numId);
    return;
  }

  const fullName = (client.name || '').trim() || 'Group client';
  await api.apiPutStaffClientProfile(token, clientId, {
    full_name: fullName,
    organization_name: fullName,
    client_type: clientType,
    save_mode: 'draft',
    is_verified: false,
    ...orgClearedPersonalFields(),
  });

  try {
    await api.apiVerifyClient(token, numId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isPersonalKycRequiredError(message)) throw err;
    await api.apiPutStaffClientProfile(token, clientId, {
      full_name: fullName,
      organization_name: fullName,
      client_type: clientType,
      save_mode: 'finished',
      is_verified: true,
      ...orgClearedPersonalFields(),
    });
  }
}
