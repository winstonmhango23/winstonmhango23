import { config } from '@/lib/config';
import {
  assignLoanOfficerSuccessCopy,
  buildAttachCreditOfficerPayload,
  buildLinkDistrictPayload,
  buildUnlinkDistrictPayload,
  buildZoneLoanOfficerAssignment,
  canSubmitAttachCreditOfficer,
  canSubmitZoneLoanOfficerAssignment,
  cioCompatibleWithZone,
  defaultSupervisorStaffId,
  districtClaimLabel,
  districtsCoveringZone,
  emptyZoneDistrictsCopy,
  filterCioStaff,
  filterZonesByBook,
  isCioRole,
  isDefaultZoneCode,
  isSmeDistrictClaim,
  loanOfficerCurrentPlacement,
  loanOfficerNeedsTransfer,
  siblingCreditBook,
  type ZoneAvailableLoanOfficer,
  type ZoneHierarchy,
  type ZoneRow,
} from '@/lib/staff/zone-district';

const agriZone: ZoneRow = {
  id: 1,
  bank_id: 1,
  name: 'Central',
  code: 'CTR',
  is_active: true,
  credit_book: 'AGRICULTURAL',
  region_name: 'Central',
  scio_name: 'Amina SCIO',
  districts_count: 2,
  officers_count: 3,
};

const smeZone: ZoneRow = {
  id: 2,
  bank_id: 1,
  name: 'Central SME',
  code: 'CTR_SME',
  is_active: true,
  credit_book: 'SME',
  region_name: 'Central',
};

const inactiveZone: ZoneRow = {
  id: 3,
  bank_id: 1,
  name: 'Retired',
  code: 'RET',
  is_active: false,
  credit_book: 'AGRICULTURAL',
};

const transferOfficer: ZoneAvailableLoanOfficer = {
  staff_id: 44,
  staff_name: 'Chisomo LO',
  supervisor_id: 9,
  supervisor_name: 'Grace CIO',
  active_district_ids: [12],
  active_district_names: ['Lilongwe'],
  active_zone_names: ['Northern'],
  is_transfer_candidate: true,
};

const freeOfficer: ZoneAvailableLoanOfficer = {
  staff_id: 45,
  staff_name: 'Mphatso LO',
  supervisor_id: null,
  active_district_ids: [],
  active_district_names: [],
  active_zone_names: [],
  is_transfer_candidate: false,
};

describe('PM zone and district helpers', () => {
  it('filters active zones by credit book and search', () => {
    const all = filterZonesByBook([agriZone, smeZone, inactiveZone], 'ALL');
    expect(all.map((z) => z.id)).toEqual([1, 2]);
    expect(filterZonesByBook([agriZone, smeZone], 'SME').map((z) => z.id)).toEqual([2]);
    expect(filterZonesByBook([agriZone, smeZone], 'GROUP').map((z) => z.id)).toEqual([1]);
    expect(filterZonesByBook([agriZone, smeZone], 'ALL', 'amina').map((z) => z.id)).toEqual([1]);
  });

  it('detects officers who already belong to another zone', () => {
    expect(loanOfficerNeedsTransfer(freeOfficer)).toBe(false);
    expect(loanOfficerNeedsTransfer(transferOfficer)).toBe(true);
    expect(loanOfficerNeedsTransfer({ active_district_ids: [3], active_zone_names: [] })).toBe(true);
    expect(loanOfficerCurrentPlacement(transferOfficer)).toContain('Northern');
    expect(loanOfficerCurrentPlacement(freeOfficer)).toBeNull();
  });

  it('builds an assignment payload that transfers busy officers into the target zone', () => {
    const transfer = buildZoneLoanOfficerAssignment({
      staffId: 44,
      supervisorStaffId: 8,
      districtIds: [21, 21, 22],
      includeTransfers: false,
      officer: transferOfficer,
    });
    expect(transfer).toEqual({
      staff_id: 44,
      supervisor_staff_id: 8,
      district_ids: [21, 22],
      is_primary: false,
      transfer: true,
    });
    expect(canSubmitZoneLoanOfficerAssignment(transfer)).toBe(true);

    const fresh = buildZoneLoanOfficerAssignment({
      staffId: 45,
      supervisorStaffId: 8,
      districtIds: [21],
      includeTransfers: false,
      officer: freeOfficer,
    });
    expect(fresh.transfer).toBe(false);
    expect(canSubmitZoneLoanOfficerAssignment({ ...fresh, district_ids: [] })).toBe(false);

    const multi = buildZoneLoanOfficerAssignment({
      staffId: 44,
      supervisorStaffId: 8,
      districtIds: [21],
      includeTransfers: true,
      allowMultiAssignment: true,
      officer: transferOfficer,
    });
    expect(multi.transfer).toBe(false);
  });

  it('prefers a district-covering CIO, then the zone SCIO', () => {
    const hierarchy: ZoneHierarchy = {
      zone_id: 1,
      zone_name: 'Central',
      scio_staff_id: 3,
      credit_officers: [
        {
          staff_id: 3,
          staff_name: 'Amina',
          is_zone_scio: true,
          district_ids: [10],
          district_names: ['Dedza'],
          loan_officers: [],
        },
        {
          staff_id: 7,
          staff_name: 'Grace',
          is_zone_scio: false,
          district_ids: [12],
          district_names: ['Lilongwe'],
          loan_officers: [],
        },
      ],
      unassigned_in_zone: [],
    };
    expect(defaultSupervisorStaffId(hierarchy, agriZone, 12)).toBe(7);
    expect(defaultSupervisorStaffId(hierarchy, { ...agriZone, scio_staff_id: 3 })).toBe(3);
  });

  it('uses transfer copy when an officer is moved between zones', () => {
    expect(
      assignLoanOfficerSuccessCopy({
        transferred: true,
        staff_name: 'Chisomo LO',
        supervisor_name: 'Grace CIO',
      })
    ).toBe('Chisomo LO transferred to Grace CIO');
  });
});

describe('zone management API paths', () => {
  it('points mobile at the same FastAPI zone hierarchy endpoints as the dashboard', () => {
    expect(config.staff.zones).toContain('/zones');
    expect(config.staff.zone(4)).toContain('/zones/4');
    expect(config.staff.zoneHierarchy(4)).toContain('/zones/4/hierarchy');
    expect(config.staff.zoneAvailableLoanOfficers(4)).toContain(
      '/zones/4/hierarchy/available-loan-officers'
    );
    expect(config.staff.zoneAvailableLoanOfficers(4, true)).toContain('include_transfer_candidates=true');
    expect(config.staff.zoneAssignLoanOfficer(4)).toContain(
      '/zones/4/hierarchy/assign-loan-officer'
    );
    expect(config.staff.zoneAttachCreditOfficer(4)).toContain(
      '/zones/4/hierarchy/attach-credit-officer'
    );
    expect(config.staff.members).toContain('/staff');
    expect(config.staff.districts).toContain('/districts');
    expect(config.staff.district(12)).toContain('/districts/12');
  });

  it('filters CIO staff and builds a multi-district attach payload', () => {
    expect(isCioRole('credit_investment_officer')).toBe(true);
    expect(isCioRole('senior_credit_investment_officer')).toBe(false);
    expect(isCioRole('loan_officer')).toBe(false);
    expect(cioCompatibleWithZone('SME', 'SME')).toBe(true);
    expect(cioCompatibleWithZone('SME', 'AGRICULTURAL')).toBe(false);
    expect(cioCompatibleWithZone('GROUP', 'AGRICULTURAL')).toBe(true);

    const cios = filterCioStaff([
      { id: 1, full_name: 'B CIO', role: 'credit_investment_officer', is_active: true },
      { id: 2, full_name: 'A CIO', role: 'CIO', is_active: true },
      { id: 3, full_name: 'SCIO', role: 'senior_credit_investment_officer', is_active: true },
      { id: 4, full_name: 'Inactive', role: 'cio', is_active: false },
    ]);
    expect(cios.map((row) => row.id)).toEqual([2, 1]);

    const payload = buildAttachCreditOfficerPayload({ staffId: 9, districtIds: [3, 3, 8] });
    expect(payload).toEqual({ staff_id: 9, district_ids: [3, 8] });
    expect(canSubmitAttachCreditOfficer(payload)).toBe(true);
    expect(canSubmitAttachCreditOfficer({ staff_id: 9, district_ids: [] })).toBe(false);
  });
});

describe('zone district coverage and SME claims', () => {
  const groupZone = {
    id: 1,
    bank_id: 9,
    region_id: 4,
    code: 'CENTRAL_AGRI',
    credit_book: 'AGRICULTURAL',
  };
  const smeZone = {
    id: 2,
    bank_id: 9,
    region_id: 4,
    code: 'CENTRAL_SME',
    credit_book: 'SME',
  };
  const northGroup = {
    id: 3,
    bank_id: 9,
    region_id: 5,
    code: 'NORTH_AGRI',
    credit_book: 'AGRICULTURAL',
  };

  it('lists Group home districts and SME claims without region auto-coverage', () => {
    expect(siblingCreditBook('SME')).toBe('GROUP');
    expect(isDefaultZoneCode('BANK_1_DEFAULT')).toBe(true);
    const zones = [groupZone, smeZone, northGroup];
    const rows = [
      { id: 10, zone_id: 1, name: 'Lilongwe' },
      { id: 11, zone_id: 3, name: 'Mzuzu' },
    ];
    expect(districtsCoveringZone(smeZone, rows, zones).map((row) => row.name)).toEqual([]);
    expect(districtsCoveringZone(groupZone, rows, zones).map((row) => row.name)).toEqual([
      'Lilongwe',
    ]);
  });

  it('keeps Group districts claimed by another SME zone off this SME zone', () => {
    const rows = [
      { id: 10, zone_id: 1, name: 'Lilongwe', sme_zone_id: 2 },
      { id: 12, zone_id: 1, name: 'Dedza', sme_zone_id: 99 },
      { id: 13, zone_id: 8, name: 'Dump', sme_zone_id: 2 },
    ];
    expect(districtsCoveringZone(smeZone, rows, [groupZone, smeZone]).map((row) => row.name)).toEqual([
      'Lilongwe',
      'Dump',
    ]);
    expect(isSmeDistrictClaim(smeZone, rows[0])).toBe(true);
    expect(districtClaimLabel(smeZone, rows[0])).toBe('Claimed for SME');
  });

  it('links SME zones via sme_zone_id and Group zones via zone_id', () => {
    expect(buildLinkDistrictPayload(smeZone)).toEqual({ sme_zone_id: 2 });
    expect(buildLinkDistrictPayload(groupZone)).toEqual({ zone_id: 1 });
    expect(
      buildUnlinkDistrictPayload(smeZone, { zone_id: 1, sme_zone_id: 2 }, 99)
    ).toEqual({ sme_zone_id: null });
    expect(buildUnlinkDistrictPayload(groupZone, { zone_id: 1 }, 99)).toEqual({ zone_id: 99 });
    expect(buildUnlinkDistrictPayload(groupZone, { zone_id: 1 }, null)).toBeNull();
    expect(emptyZoneDistrictsCopy(smeZone)).toContain('Lilongwe');
    expect(emptyZoneDistrictsCopy(groupZone)).toContain('another Group zone');
  });
});
