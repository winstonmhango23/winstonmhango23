import { api } from '@/lib/api-client';
import { config } from '@/lib/config';
import type {
  DistrictRow,
  DistrictUpdatePayload,
  ZoneAssignLoanOfficerPayload,
  ZoneAvailableLoanOfficer,
  ZoneHierarchy,
  ZoneRow,
  ZoneStaffMember,
} from '@/lib/staff/zone-district';

export type ZoneDetail = ZoneRow & {
  districts: DistrictRow[];
  hierarchy?: ZoneHierarchy | null;
};

export type ZoneAssignLoanOfficerResult = {
  zone_id: number;
  staff_id: number;
  staff_name?: string | null;
  supervisor_staff_id: number;
  supervisor_name?: string | null;
  district_ids: number[];
  transferred?: boolean;
  previous_supervisor_id?: number | null;
  previous_supervisor_name?: string | null;
  message?: string | null;
};

export type RegionRow = {
  id: number;
  bank_id: number;
  name: string;
  code: string;
  description?: string | null;
  is_active: boolean;
  zones_count?: number;
};

export async function apiGetRegions(token: string): Promise<RegionRow[]> {
  const res = await api.get<{ regions?: RegionRow[]; total?: number }>(config.staff.regions, token);
  return res?.regions ?? [];
}

export async function apiGetZones(token: string): Promise<ZoneRow[]> {
  const res = await api.get<{ zones?: ZoneRow[]; total?: number }>(config.staff.zones, token);
  return res?.zones ?? [];
}

export async function apiGetZoneDetail(token: string, zoneId: number): Promise<ZoneDetail> {
  return api.get<ZoneDetail>(config.staff.zone(zoneId), token);
}

export async function apiUpdateZone(
  token: string,
  zoneId: number,
  body: Partial<Pick<ZoneRow, 'allow_multi_loan_officer_assignment'>>
): Promise<ZoneRow> {
  return api.put<ZoneRow>(config.staff.zone(zoneId), body, token);
}

export async function apiGetZoneHierarchy(token: string, zoneId: number): Promise<ZoneHierarchy> {
  return api.get<ZoneHierarchy>(config.staff.zoneHierarchy(zoneId), token);
}

export async function apiGetDistricts(
  token: string,
  params?: {
    zoneId?: number;
    unassigned?: boolean;
    availableForZoneId?: number;
    limit?: number;
  }
): Promise<DistrictRow[]> {
  const query = new URLSearchParams();
  if (params?.zoneId !== undefined) query.set('zone_id', String(params.zoneId));
  if (params?.unassigned) query.set('unassigned', 'true');
  if (params?.availableForZoneId !== undefined) {
    query.set('available_for_zone_id', String(params.availableForZoneId));
  }
  query.set('limit', String(params?.limit ?? 1000));
  const qs = query.toString();
  const res = await api.get<{ districts?: DistrictRow[] }>(
    qs ? `${config.staff.districts}?${qs}` : config.staff.districts,
    token
  );
  return res?.districts ?? [];
}

export async function apiGetDistrictsForZone(token: string, zoneId: number): Promise<DistrictRow[]> {
  return apiGetDistricts(token, { zoneId, limit: 1000 });
}

export async function apiUpdateDistrict(
  token: string,
  districtId: number,
  body: DistrictUpdatePayload
): Promise<DistrictRow> {
  return api.put<DistrictRow>(config.staff.district(districtId), body, token);
}

export async function apiGetAvailableLoanOfficers(
  token: string,
  zoneId: number,
  includeTransferCandidates = false
): Promise<ZoneAvailableLoanOfficer[]> {
  const res = await api.get<{ officers?: ZoneAvailableLoanOfficer[]; total?: number }>(
    config.staff.zoneAvailableLoanOfficers(zoneId, includeTransferCandidates),
    token
  );
  return res?.officers ?? [];
}

export async function apiAssignZoneLoanOfficer(
  token: string,
  zoneId: number,
  body: ZoneAssignLoanOfficerPayload
): Promise<ZoneAssignLoanOfficerResult> {
  return api.post<ZoneAssignLoanOfficerResult>(config.staff.zoneAssignLoanOfficer(zoneId), body, token);
}

export async function apiAttachZoneCreditOfficer(
  token: string,
  zoneId: number,
  body: { staff_id: number; district_ids: number[] }
): Promise<ZoneHierarchy> {
  return api.post<ZoneHierarchy>(config.staff.zoneAttachCreditOfficer(zoneId), body, token);
}

export async function apiGetStaffMembers(token: string): Promise<ZoneStaffMember[]> {
  const parse = (res: ZoneStaffMember[] | { staff?: ZoneStaffMember[] } | null | undefined) =>
    Array.isArray(res) ? res : res?.staff ?? [];
  try {
    return parse(
      await api.get<ZoneStaffMember[] | { staff?: ZoneStaffMember[] }>(
        `${config.staff.members}?limit=100&all_branches=true`,
        token
      )
    );
  } catch {
    return parse(
      await api.get<ZoneStaffMember[] | { staff?: ZoneStaffMember[] }>(
        `${config.staff.members}?limit=100`,
        token
      )
    );
  }
}
