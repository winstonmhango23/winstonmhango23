import {
  creditBookLabel,
  isSmeCreditBook,
  normalizeCreditBook,
} from '@/lib/loan-origination/origination-workflow';

export type ZoneCreditBookFilter = 'ALL' | 'GROUP' | 'SME';

export type ZoneRow = {
  id: number;
  bank_id: number;
  region_id?: number | null;
  region_name?: string | null;
  scio_staff_id?: number | null;
  scio_name?: string | null;
  scio_role?: string | null;
  name: string;
  code: string;
  description?: string | null;
  is_active: boolean;
  credit_book?: string | null;
  districts_count?: number;
  officers_count?: number;
  allow_multi_loan_officer_assignment?: boolean;
};

export type DistrictRow = {
  id: number;
  zone_id: number;
  zone_name?: string | null;
  sme_zone_id?: number | null;
  sme_zone_name?: string | null;
  home_credit_book?: string | null;
  name: string;
  code: string;
  is_active: boolean;
  loan_officers_count?: number;
};

export type DistrictUpdatePayload = {
  zone_id?: number;
  sme_zone_id?: number | null;
};

export type CoverageZone = {
  id: number;
  code: string;
  credit_book?: string | null;
};

export type CoverageDistrict = {
  id?: number;
  zone_id: number;
  sme_zone_id?: number | null;
};

export function isDefaultZoneCode(code?: string | null): boolean {
  return String(code || '').endsWith('_DEFAULT');
}

export function siblingCreditBook(book?: string | null): 'SME' | 'GROUP' {
  return normalizeCreditBook(book) === 'SME' ? 'GROUP' : 'SME';
}

/** Districts already on this zone. SME uses claims; Group uses the home zone. */
export function districtsCoveringZone<T extends CoverageDistrict>(
  zone: CoverageZone,
  districts: T[],
  _zones?: CoverageZone[]
): T[] {
  if (isDefaultZoneCode(zone.code)) {
    return districts.filter((district) => district.zone_id === zone.id);
  }

  const selected: T[] = [];
  const seen = new Set<string>();
  const take = (row: T) => {
    const key = row.id != null ? `id:${row.id}` : `zone:${row.zone_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(row);
  };

  for (const district of districts) {
    if (district.zone_id === zone.id) take(district);
    if (isSmeCreditBook(zone.credit_book) && district.sme_zone_id === zone.id) {
      take(district);
    }
  }

  return selected;
}

export function isSmeDistrictClaim(
  zone: Pick<CoverageZone, 'id' | 'credit_book'>,
  district: CoverageDistrict
): boolean {
  return isSmeCreditBook(zone.credit_book) && district.sme_zone_id === zone.id;
}

export function buildLinkDistrictPayload(
  zone: Pick<CoverageZone, 'id' | 'credit_book'>
): DistrictUpdatePayload {
  if (isSmeCreditBook(zone.credit_book)) {
    return { sme_zone_id: zone.id };
  }
  return { zone_id: zone.id };
}

export function buildUnlinkDistrictPayload(
  zone: Pick<CoverageZone, 'id' | 'credit_book'>,
  district: CoverageDistrict,
  defaultZoneId?: number | null
): DistrictUpdatePayload | null {
  if (isSmeDistrictClaim(zone, district)) {
    return { sme_zone_id: null };
  }
  if (!defaultZoneId || defaultZoneId <= 0) return null;
  return { zone_id: defaultZoneId };
}

export function emptyZoneDistrictsCopy(zone: Pick<CoverageZone, 'credit_book'>): string {
  if (isSmeCreditBook(zone.credit_book)) {
    return 'This SME zone can claim any district that another SME zone has not already taken. Open Add District — Lilongwe can sit on both an SME zone and a Group zone.';
  }
  return 'No districts in this zone. Add a district to get started. Districts already on another Group zone stay on that zone.';
}

export function districtClaimLabel(
  zone: Pick<CoverageZone, 'id' | 'credit_book'>,
  district: CoverageDistrict
): string | null {
  const isHome = district.zone_id === zone.id;
  if (isSmeDistrictClaim(zone, district) && !isHome) return 'Claimed for SME';
  if (!isHome && !isSmeDistrictClaim(zone, district)) {
    return `Shared from ${creditBookLabel(siblingCreditBook(zone.credit_book))} zone`;
  }
  return null;
}

export type ZoneLoanOfficerNode = {
  staff_id: number;
  staff_name?: string | null;
  staff_role?: string | null;
  district_ids: number[];
  district_names: string[];
  client_count?: number;
};

export type ZoneCreditOfficerNode = {
  staff_id: number;
  staff_name?: string | null;
  staff_role?: string | null;
  is_zone_scio?: boolean;
  credit_book?: string | null;
  district_ids: number[];
  district_names: string[];
  loan_officers: ZoneLoanOfficerNode[];
};

export type ZoneHierarchy = {
  zone_id: number;
  zone_name: string;
  credit_book?: string;
  loan_officers_optional?: boolean;
  scio_staff_id?: number | null;
  scio_name?: string | null;
  credit_officers: ZoneCreditOfficerNode[];
  unassigned_in_zone: ZoneLoanOfficerNode[];
  allow_multi_loan_officer_assignment?: boolean;
};

export type ZoneAvailableLoanOfficer = {
  staff_id: number;
  staff_name?: string | null;
  staff_role?: string | null;
  employee_id?: string | null;
  email?: string | null;
  supervisor_id?: number | null;
  supervisor_name?: string | null;
  active_district_ids: number[];
  active_district_names: string[];
  active_zone_names: string[];
  is_transfer_candidate: boolean;
};

export type ZoneAssignLoanOfficerPayload = {
  staff_id: number;
  supervisor_staff_id: number;
  district_ids: number[];
  is_primary: boolean;
  transfer: boolean;
};

export function zoneBookLabel(book?: string | null): string {
  return creditBookLabel(book);
}

export function filterZonesByBook(
  zones: readonly ZoneRow[],
  book: ZoneCreditBookFilter,
  search = ''
): ZoneRow[] {
  const q = search.trim().toLowerCase();
  return zones.filter((zone) => {
    if (!zone.is_active) return false;
    const zoneBook = normalizeCreditBook(zone.credit_book) ?? 'GROUP';
    if (book !== 'ALL' && zoneBook !== book) return false;
    if (!q) return true;
    return [zone.name, zone.code, zone.region_name, zone.scio_name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
}

export function loanOfficerNeedsTransfer(officer?: {
  is_transfer_candidate?: boolean;
  supervisor_id?: number | null;
  active_district_ids?: number[];
  active_zone_names?: string[];
} | null): boolean {
  if (!officer) return false;
  if (officer.is_transfer_candidate) return true;
  if (officer.supervisor_id != null) return true;
  if ((officer.active_district_ids?.length ?? 0) > 0) return true;
  return (officer.active_zone_names?.length ?? 0) > 0;
}

export function loanOfficerCurrentPlacement(officer?: ZoneAvailableLoanOfficer | null): string | null {
  if (!officer) return null;
  const zones = (officer.active_zone_names ?? []).filter(Boolean);
  const districts = (officer.active_district_names ?? []).filter(Boolean);
  if (zones.length === 0 && districts.length === 0 && !officer.supervisor_name) return null;
  const parts = [
    zones.length > 0 ? zones.join(', ') : null,
    districts.length > 0 ? districts.join(', ') : null,
    officer.supervisor_name ? `reports to ${officer.supervisor_name}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function defaultSupervisorStaffId(
  hierarchy: ZoneHierarchy | undefined,
  zone: Pick<ZoneRow, 'scio_staff_id'>,
  districtId?: number
): number {
  const officers = (hierarchy?.credit_officers ?? []).filter((c) => !c.is_zone_scio);
  if (districtId) {
    const covering = officers.filter((c) => c.district_ids.includes(districtId));
    if (covering[0]?.staff_id) return covering[0].staff_id;
  }
  return zone.scio_staff_id ?? officers[0]?.staff_id ?? hierarchy?.scio_staff_id ?? 0;
}

export function supervisorOptions(hierarchy?: ZoneHierarchy | null): ZoneCreditOfficerNode[] {
  return hierarchy?.credit_officers ?? [];
}

export function buildZoneLoanOfficerAssignment(input: {
  staffId: number;
  supervisorStaffId: number;
  districtIds: number[];
  isPrimary?: boolean;
  includeTransfers: boolean;
  allowMultiAssignment?: boolean;
  officer?: ZoneAvailableLoanOfficer | null;
}): ZoneAssignLoanOfficerPayload {
  const districtIds = Array.from(new Set(input.districtIds.filter((id) => Number.isFinite(id) && id > 0)));
  return {
    staff_id: input.staffId,
    supervisor_staff_id: input.supervisorStaffId,
    district_ids: districtIds,
    is_primary: Boolean(input.isPrimary),
    transfer: input.allowMultiAssignment
      ? false
      : Boolean(input.includeTransfers || loanOfficerNeedsTransfer(input.officer)),
  };
}

export function canSubmitZoneLoanOfficerAssignment(payload: ZoneAssignLoanOfficerPayload): boolean {
  return (
    payload.staff_id > 0 &&
    payload.supervisor_staff_id > 0 &&
    payload.district_ids.length > 0
  );
}

export function assignLoanOfficerSuccessCopy(result: {
  message?: string | null;
  transferred?: boolean;
  staff_name?: string | null;
  supervisor_name?: string | null;
}): string {
  if (result.message?.trim()) return result.message.trim();
  const officer = result.staff_name?.trim() || 'Loan officer';
  const supervisor = result.supervisor_name?.trim() || 'the zone supervisor';
  if (result.transferred) {
    return `${officer} transferred to ${supervisor}`;
  }
  return `Assigned ${officer} to ${supervisor}`;
}

export type ZoneStaffMember = {
  id: number;
  full_name: string;
  role?: string | null;
  is_active?: boolean;
  credit_book?: string | null;
  employee_id?: string | null;
};

export function isScioRole(role?: string | null): boolean {
  if (!role) return false;
  const normalized = String(role).toLowerCase().replace(/[\s-]+/g, '_').trim();
  return (
    normalized === 'senior_credit_investment_officer' ||
    normalized === 'scio' ||
    (normalized.includes('senior') && normalized.includes('credit'))
  );
}

export function isCioRole(role?: string | null): boolean {
  if (!role || isScioRole(role)) return false;
  const normalized = String(role).toLowerCase().replace(/[\s-]+/g, '_').trim();
  return (
    normalized === 'credit_investment_officer' ||
    normalized === 'cio' ||
    (normalized.includes('credit') &&
      normalized.includes('investment') &&
      normalized.includes('officer'))
  );
}

export function filterCioStaff(staff: readonly ZoneStaffMember[]): ZoneStaffMember[] {
  return staff
    .filter((member) => member.is_active !== false && isCioRole(member.role))
    .slice()
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export function cioCompatibleWithZone(
  cioBook?: string | null,
  zoneBook?: string | null
): boolean {
  const staffBook = normalizeCreditBook(cioBook);
  const targetBook = normalizeCreditBook(zoneBook);
  if (!staffBook || !targetBook) return true;
  return staffBook === targetBook;
}

export function canSubmitAttachCreditOfficer(payload: {
  staff_id: number;
  district_ids: number[];
}): boolean {
  return payload.staff_id > 0 && payload.district_ids.length > 0;
}

export function buildAttachCreditOfficerPayload(input: {
  staffId: number;
  districtIds: number[];
}): { staff_id: number; district_ids: number[] } {
  return {
    staff_id: input.staffId,
    district_ids: Array.from(new Set(input.districtIds.filter((id) => Number.isFinite(id) && id > 0))),
  };
}
