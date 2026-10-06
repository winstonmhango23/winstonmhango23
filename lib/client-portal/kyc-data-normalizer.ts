/**
 * Normalizes KYC payload from the borrower API for form controls and completion checks.
 */

import type { ClientKYCData } from './kyc-completion-calculator';

const DATE_INPUT_PATTERN = /^(\d{4}-\d{2}-\d{2})/;

export function toDateInputValue(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (!s) return null;

  const isoPrefix = s.match(DATE_INPUT_PATTERN);
  if (isoPrefix) return isoPrefix[1];

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /[a-z]|gmt|utc|\//i.test(s)) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    if (y >= 1900 && y <= 2100) return `${y}-${m}-${d}`;
  }

  return null;
}

export function isKycDateFieldComplete(value: string | Date | null | undefined): boolean {
  return Boolean(toDateInputValue(value));
}

/**
 * Organization-account KYC (no personal national ID / profile photo).
 * Matches borrower portal: GROUP uses org KYC; COOPERATIVE is the same parent shape.
 * SME stays on the individual + community path (village/town SME).
 */
export function isOrganizationKycClientType(type: string | null | undefined): boolean {
  const t = String(type || '').toUpperCase();
  return t === 'GROUP' || t === 'COOPERATIVE';
}

/** Resolve the client type used for KYC field requirements (matches portal UI). */
export function resolveKycClientType(
  data: ClientKYCData,
  sessionClientType?: string | null
): string {
  const explicit = String(data.client_type || sessionClientType || '').trim();
  if (explicit) return explicit;

  const hasGroupFields = Boolean(
    data.chairperson_name ||
      data.group_purpose ||
      data.registration_date ||
      data.group_constitution_path ||
      data.group_photo_path ||
      data.secretary_name ||
      data.treasurer_name
  );
  const hasIndividualFields = Boolean(
    data.national_id || isKycDateFieldComplete(data.date_of_birth) || data.gender
  );
  if (hasGroupFields && !hasIndividualFields) return 'GROUP';
  if (hasIndividualFields && !hasGroupFields) return 'INDIVIDUAL';
  return '';
}

/** Drop cross-type fields so group parents never submit individual KYC noise (and vice versa). */
export function sanitizeKycPayloadForClientType(data: ClientKYCData): ClientKYCData {
  const type = String(data.client_type || '').toUpperCase();
  if (isOrganizationKycClientType(type)) {
    const {
      national_id: _n,
      date_of_birth: _d,
      gender: _g,
      marital_status: _m,
      occupation: _o,
      next_of_kin_name: _kn,
      next_of_kin_phone: _kp,
      next_of_kin_relationship: _kr,
      profile_photo_path: _pp,
      id_document_path: _idf,
      id_document_back_path: _idb,
      ...rest
    } = data;
    return rest;
  }
  // Personal KYC paths: INDIVIDUAL, SME, and SALARY all strip org/group fields.
  if (type === 'INDIVIDUAL' || type === 'SME' || type === 'SALARY') {
    const {
      registration_number: _rn,
      registration_date: _rd,
      group_constitution_path: _gc,
      group_photo_path: _gph,
      meeting_schedule: _ms,
      group_purpose: _gp,
      member_count: _mc,
      chairperson_name: _cn,
      chairperson_phone: _cp,
      secretary_name: _sn,
      secretary_phone: _sp,
      treasurer_name: _tn,
      treasurer_phone: _tp,
      ...rest
    } = data;
    return rest;
  }
  return data;
}

export function normalizeKYCDataForForm(data: ClientKYCData): ClientKYCData {
  return {
    ...data,
    date_of_birth: toDateInputValue(data.date_of_birth),
    registration_date: toDateInputValue(data.registration_date),
  };
}

export function prepareKycDataForCompletion(
  data: ClientKYCData,
  sessionClientType?: string | null
): ClientKYCData {
  const normalized = normalizeKYCDataForForm(data);
  const client_type =
    resolveKycClientType(normalized, sessionClientType) || normalized.client_type || null;
  return applyKycFormDefaults({ ...normalized, client_type }, sessionClientType);
}

/** UI chip defaults must be reflected in state/completion checks. */
export function applyKycFormDefaults(
  data: ClientKYCData,
  sessionClientType?: string | null
): ClientKYCData {
  const client_type =
    resolveKycClientType(data, sessionClientType) || data.client_type || null;
  if (isOrganizationKycClientType(client_type)) {
    return { ...data, client_type };
  }
  return {
    ...data,
    client_type,
    gender: data.gender?.trim() || 'M',
    marital_status: data.marital_status?.trim() || 'SINGLE',
  };
}

export function isKycDocumentPathComplete(path: string | null | undefined): boolean {
  if (path == null) return false;
  const trimmed = String(path).trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('queued:')) return true;
  return true;
}

/** Leadership / member KYC must not block staff group-parent updates. */
export const STAFF_GROUP_NON_BLOCKING_FIELDS = new Set([
  'registration_date',
  'registration_number',
  'chairperson_name',
  'chairperson_phone',
  'secretary_name',
  'secretary_phone',
  'treasurer_name',
  'treasurer_phone',
  'group_purpose',
  'meeting_schedule',
  'member_count',
]);

export function staffFinishMissingFieldLabels(
  fields: Array<{ field: string; label: string; isRequired: boolean; isComplete: boolean }>,
  _clientType?: string | null
): string[] {
  // Leadership / member KYC lives on member records. Never block a staff
  // group-parent Finish on those fields, even if client_type is missing.
  return fields
    .filter((f) => f.isRequired && !f.isComplete)
    .filter((f) => !STAFF_GROUP_NON_BLOCKING_FIELDS.has(f.field))
    .map((f) => f.label);
}

export function staffFinishRequiredPercentage(
  fields: Array<{ field: string; isRequired: boolean; isComplete: boolean }>
): number {
  const required = fields.filter(
    (f) => f.isRequired && !STAFF_GROUP_NON_BLOCKING_FIELDS.has(f.field)
  );
  if (required.length === 0) return 100;
  const done = required.filter((f) => f.isComplete).length;
  return Math.round((done / required.length) * 100);
}

export function normalizeKycFieldValue(
  field: keyof ClientKYCData,
  value: string | number | null
): string | number | null {
  if ((field === 'date_of_birth' || field === 'registration_date') && typeof value === 'string') {
    return toDateInputValue(value) ?? value;
  }
  return value;
}

/** Screen / shell titles aligned with client-portal group vs individual KYC. */
export function kycScreenCopy(clientType: string | null | undefined): {
  title: string;
  subtitle: string;
  shellSubtitle: string;
} {
  const isOrg = isOrganizationKycClientType(clientType);
  if (isOrg) {
    return {
      title: 'Complete your group profile',
      subtitle:
        'Group KYC verification is required before you can access your dashboard. This helps us verify your organization.',
      shellSubtitle: 'Complete your organization profile to access all features',
    };
  }
  return {
    title: 'Complete your profile',
    subtitle:
      'KYC verification is required before you can access your dashboard. This helps us verify your identity.',
    shellSubtitle: 'Complete your profile to access all features',
  };
}
