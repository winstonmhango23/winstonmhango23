/**
 * KYC completion calculator tests — individual + group required fields.
 */

import {
  applyKycFormDefaults,
  isKycDateFieldComplete,
  isKycDocumentPathComplete,
  isOrganizationKycClientType,
  prepareKycDataForCompletion,
  resolveKycClientType,
  sanitizeKycPayloadForClientType,
  staffFinishMissingFieldLabels,
  staffFinishRequiredPercentage,
  kycScreenCopy,
  toDateInputValue,
} from '@/lib/client-portal/kyc-data-normalizer';
import {
  calculateKYCCompletion,
  getNextRecommendedField,
  type ClientKYCData,
} from '@/lib/client-portal/kyc-completion-calculator';
import { checkClientSessionKyc } from '@/lib/loan-origination/kyc-gate';
import type { MobileClientSessionContext } from '@/lib/data/api';

function individualBase(overrides: Partial<ClientKYCData> = {}): ClientKYCData {
  return prepareKycDataForCompletion(
    {
      client_type: 'INDIVIDUAL',
      national_id: 'MW123456',
      date_of_birth: '1990-05-15',
      profile_photo_path: '/uploads/profile.jpg',
      id_document_path: '/uploads/id-front.jpg',
      email: 'client@cofi.mw',
      phone_number: '+265991234567',
      address: 'Lilongwe Area 25',
      occupation: 'Trader',
      next_of_kin_name: 'Jane Banda',
      next_of_kin_phone: '+265992345678',
      next_of_kin_relationship: 'Spouse',
      ...overrides,
    },
    'INDIVIDUAL'
  );
}

describe('KYC form defaults', () => {
  it('applies gender and marital defaults for individual clients', () => {
    const result = applyKycFormDefaults({ client_type: 'INDIVIDUAL' }, 'INDIVIDUAL');
    expect(result.gender).toBe('M');
    expect(result.marital_status).toBe('SINGLE');
  });

  it('does not apply personal defaults for group clients', () => {
    const result = applyKycFormDefaults({ client_type: 'GROUP' }, 'GROUP');
    expect(result.gender).toBeUndefined();
    expect(result.marital_status).toBeUndefined();
  });

  it('does not apply personal defaults for cooperative clients', () => {
    const result = applyKycFormDefaults({ client_type: 'COOPERATIVE' }, 'COOPERATIVE');
    expect(result.gender).toBeUndefined();
    expect(isOrganizationKycClientType('COOPERATIVE')).toBe(true);
  });

  it('treats SME as personal KYC (not organization KYC)', () => {
    expect(isOrganizationKycClientType('SME')).toBe(false);
    const result = applyKycFormDefaults({ client_type: 'SME' }, 'SME');
    expect(result.gender).toBe('M');
  });
});

describe('loan request KYC gate (group vs individual)', () => {
  function session(
    overrides: Partial<MobileClientSessionContext> &
      Pick<MobileClientSessionContext, 'dashboard_mode' | 'kyc_is_complete'>
  ): MobileClientSessionContext {
    return {
      client_id: 1,
      full_name: 'Borrower',
      kyc_completion_percentage: 0,
      kyc_required_percentage: 0,
      has_existing_loans: false,
      can_provision_member_credentials: false,
      can_administer_group_roster: false,
      can_manage_group_leaders: false,
      can_edit_group_origination: false,
      can_record_group_repayments: false,
      ...overrides,
    };
  }

  it('does not block group_parent loan requests on personal KYC flags', () => {
    const status = checkClientSessionKyc(
      session({ dashboard_mode: 'group_parent', kyc_is_complete: false })
    );
    expect(status.isComplete).toBe(true);
  });

  it('blocks individual borrowers until session KYC is complete', () => {
    const status = checkClientSessionKyc(
      session({ dashboard_mode: 'individual', kyc_is_complete: false })
    );
    expect(status.isComplete).toBe(false);
  });
});

describe('organization vs individual KYC payload', () => {
  it('strips personal national-ID fields from group payloads', () => {
    const sanitized = sanitizeKycPayloadForClientType({
      client_type: 'GROUP',
      national_id: 'should-drop',
      date_of_birth: '1990-01-01',
      gender: 'M',
      id_document_path: '/uploads/id.jpg',
      id_document_back_path: '/uploads/id-back.jpg',
      profile_photo_path: '/uploads/face.jpg',
      next_of_kin_name: 'X',
      chairperson_name: 'Chair',
      group_constitution_path: '/uploads/const.pdf',
    });
    expect(sanitized.national_id).toBeUndefined();
    expect(sanitized.id_document_path).toBeUndefined();
    expect(sanitized.id_document_back_path).toBeUndefined();
    expect(sanitized.profile_photo_path).toBeUndefined();
    expect(sanitized.chairperson_name).toBe('Chair');
    expect(sanitized.group_constitution_path).toBe('/uploads/const.pdf');
  });

  it('strips group leadership fields from individual payloads', () => {
    const sanitized = sanitizeKycPayloadForClientType({
      client_type: 'INDIVIDUAL',
      national_id: 'MW1',
      chairperson_name: 'should-drop',
      group_constitution_path: '/uploads/const.pdf',
      registration_date: '2020-01-01',
    });
    expect(sanitized.national_id).toBe('MW1');
    expect(sanitized.chairperson_name).toBeUndefined();
    expect(sanitized.group_constitution_path).toBeUndefined();
  });

  it('strips group leadership fields from SALARY payloads (same personal path)', () => {
    const sanitized = sanitizeKycPayloadForClientType({
      client_type: 'SALARY',
      national_id: 'MW-SAL',
      chairperson_name: 'should-drop',
      group_constitution_path: '/uploads/const.pdf',
      registration_number: 'REG-1',
    });
    expect(sanitized.national_id).toBe('MW-SAL');
    expect(sanitized.chairperson_name).toBeUndefined();
    expect(sanitized.group_constitution_path).toBeUndefined();
    expect(sanitized.registration_number).toBeUndefined();
  });

  it('strips group leadership fields from SME payloads but keeps community', () => {
    const sanitized = sanitizeKycPayloadForClientType({
      client_type: 'SME',
      national_id: 'MW-SME',
      community_type: 'Village',
      village_head: 'Chief A',
      chairperson_name: 'should-drop',
      registration_date: '2020-01-01',
    });
    expect(sanitized.national_id).toBe('MW-SME');
    expect(sanitized.community_type).toBe('Village');
    expect(sanitized.village_head).toBe('Chief A');
    expect(sanitized.chairperson_name).toBeUndefined();
    expect(sanitized.registration_date).toBeUndefined();
  });

  it('infers GROUP from leadership fields when type is missing', () => {
    expect(
      resolveKycClientType({
        chairperson_name: 'Chair',
        group_purpose: 'Savings',
      })
    ).toBe('GROUP');
  });

  it('uses group-aware screen copy', () => {
    expect(kycScreenCopy('GROUP').title).toMatch(/group/i);
    expect(kycScreenCopy('INDIVIDUAL').title).not.toMatch(/group/i);
  });
});

describe('individual KYC completion', () => {
  it('is complete when all required fields are filled (with chip defaults)', () => {
    const data = individualBase();
    const result = calculateKYCCompletion(data);
    expect(result.isComplete).toBe(true);
    expect(result.requiredPercentage).toBe(100);
  });

  it('requires community type for SME and village head when Village', () => {
    const missingCommunity = calculateKYCCompletion(
      individualBase({ client_type: 'SME', community_type: null })
    );
    expect(missingCommunity.isComplete).toBe(false);
    expect(
      missingCommunity.fields.find((f) => f.field === 'community_type')?.isRequired
    ).toBe(true);

    const townOk = calculateKYCCompletion(
      individualBase({ client_type: 'SME', community_type: 'Town' })
    );
    expect(townOk.isComplete).toBe(true);

    const villageMissing = calculateKYCCompletion(
      individualBase({
        client_type: 'SME',
        community_type: 'Village',
        village_head: null,
        village_head_phone: null,
      })
    );
    expect(villageMissing.isComplete).toBe(false);
    const missing = villageMissing.fields
      .filter((f) => f.isRequired && !f.isComplete)
      .map((f) => f.field);
    expect(missing).toEqual(expect.arrayContaining(['village_head', 'village_head_phone']));
  });

  it('uses personal KYC rules for SALARY (no org fields required)', () => {
    const result = calculateKYCCompletion(individualBase({ client_type: 'SALARY' }));
    expect(result.isComplete).toBe(true);
    expect(result.fields.some((f) => f.field === 'national_id')).toBe(true);
    expect(result.fields.some((f) => f.field === 'group_constitution_path')).toBe(false);
    expect(result.fields.some((f) => f.field === 'community_type')).toBe(false);
  });

  it('was incomplete before defaults when gender/marital unset', () => {
    const raw = individualBase();
    const withoutDefaults = {
      ...raw,
      gender: null,
      marital_status: null,
    };
    const before = calculateKYCCompletion(withoutDefaults);
    expect(before.isComplete).toBe(false);
    expect(before.fields.filter((f) => !f.isComplete).map((f) => f.field)).toEqual(
      expect.arrayContaining(['gender', 'marital_status'])
    );
  });

  it('lists ID document as incomplete when missing (profile photo optional)', () => {
    const data = individualBase({ id_document_path: null });
    const result = calculateKYCCompletion(data);
    expect(result.isComplete).toBe(false);
    expect(getNextRecommendedField(data)?.field).toBe('id_document_path');
  });

  it('tracks National ID front and back document fields', () => {
    const result = calculateKYCCompletion(individualBase({ id_document_back_path: null }));
    const labels = result.fields
      .filter((f) => f.field === 'id_document_path' || f.field === 'id_document_back_path')
      .map((f) => f.label);
    expect(labels).toEqual(
      expect.arrayContaining(['National ID (Front)', 'National ID (Back)'])
    );
    expect(result.fields.find((f) => f.field === 'id_document_back_path')?.isRequired).toBe(false);
  });

  it('accepts queued offline document paths', () => {
    expect(isKycDocumentPathComplete('queued:profile_photo_path')).toBe(true);
    expect(isKycDocumentPathComplete('')).toBe(false);
    expect(isKycDocumentPathComplete(null)).toBe(false);
  });
});

describe('group KYC completion', () => {
  function groupBase(overrides: Partial<ClientKYCData> = {}): ClientKYCData {
    return prepareKycDataForCompletion(
      {
        client_type: 'GROUP',
        registration_date: '2020-01-10',
        group_constitution_path: '/uploads/constitution.pdf',
        group_photo_path: '/uploads/group.jpg',
        email: 'group@cofi.mw',
        phone_number: '+265991111111',
        address: 'Mzuzu',
        chairperson_name: 'Chair A',
        chairperson_phone: '+265991111112',
        secretary_name: 'Sec B',
        secretary_phone: '+265991111113',
        treasurer_name: 'Treas C',
        treasurer_phone: '+265991111114',
        group_purpose: 'Savings',
        meeting_schedule: 'Weekly Monday',
        member_count: 12,
        community_type: 'Town',
        ...overrides,
      },
      'GROUP'
    );
  }

  it('is complete for a filled group profile', () => {
    const result = calculateKYCCompletion(groupBase());
    expect(result.isComplete).toBe(true);
  });

  it('requires village head fields only when community is Village', () => {
    const town = calculateKYCCompletion(groupBase({ community_type: 'Town' }));
    expect(town.isComplete).toBe(true);

    const village = calculateKYCCompletion(
      groupBase({ community_type: 'Village', village_head: null, village_head_phone: null })
    );
    expect(village.isComplete).toBe(false);
    const missing = village.fields.filter((f) => f.isRequired && !f.isComplete).map((f) => f.field);
    expect(missing).toEqual(expect.arrayContaining(['village_head', 'village_head_phone']));
  });

  it('uses organization KYC rules for cooperative clients', () => {
    const result = calculateKYCCompletion(groupBase({ client_type: 'COOPERATIVE' }));
    expect(result.isComplete).toBe(true);
    expect(result.fields.some((f) => f.field === 'national_id')).toBe(false);
    expect(result.fields.some((f) => f.field === 'group_constitution_path')).toBe(true);
  });

  it('does not require personal national ID fields for groups', () => {
    const result = calculateKYCCompletion(groupBase());
    const personal = result.fields.map((f) => f.field);
    expect(personal).not.toEqual(expect.arrayContaining(['national_id', 'id_document_path']));
  });
});

describe('toDateInputValue', () => {
  it('extracts YYYY-MM-DD from ISO datetime and Date objects', () => {
    expect(toDateInputValue('1985-05-15T00:00:00+00:00')).toBe('1985-05-15');
    expect(toDateInputValue('1985-05-15 00:00:00')).toBe('1985-05-15');
    expect(toDateInputValue(new Date('2020-01-10T00:00:00.000Z'))).toBe('2020-01-10');
    expect(isKycDateFieldComplete(new Date('2020-01-10T00:00:00.000Z'))).toBe(true);
  });

  it('returns null for empty or unparseable values', () => {
    expect(toDateInputValue(null)).toBeNull();
    expect(toDateInputValue('')).toBeNull();
    expect(toDateInputValue('not-a-date')).toBeNull();
  });
});

describe('staffFinishMissingFieldLabels', () => {
  it('does not block group updates on leadership / member KYC fields', () => {
    const missing = staffFinishMissingFieldLabels(
      [
        { field: 'chairperson_name', label: 'Chairperson Name', isRequired: true, isComplete: false },
        { field: 'secretary_phone', label: 'Secretary Phone', isRequired: true, isComplete: false },
        { field: 'registration_date', label: 'Registration Date', isRequired: true, isComplete: false },
        {
          field: 'group_constitution_path',
          label: 'Group Constitution Document',
          isRequired: true,
          isComplete: false,
        },
      ],
      'GROUP'
    );
    expect(missing).toEqual(['Group Constitution Document']);
  });

  it('still skips leadership fields when client type is missing', () => {
    const missing = staffFinishMissingFieldLabels(
      [
        { field: 'registration_date', label: 'Registration Date', isRequired: true, isComplete: false },
        { field: 'chairperson_name', label: 'Chairperson Name', isRequired: true, isComplete: false },
        {
          field: 'group_constitution_path',
          label: 'Group Constitution Document',
          isRequired: true,
          isComplete: false,
        },
      ],
      undefined
    );
    expect(missing).toEqual(['Group Constitution Document']);
  });

  it('lets staff finish a group parent without chairperson or registration date', () => {
    const result = calculateKYCCompletion(
      prepareKycDataForCompletion(
        {
          client_type: 'GROUP',
          group_constitution_path: '/uploads/constitution.pdf',
          group_photo_path: '/uploads/group.jpg',
          phone_number: '+265991111111',
          address: 'Mzuzu',
        },
        'GROUP'
      )
    );
    expect(result.isComplete).toBe(false);
    expect(staffFinishMissingFieldLabels(result.fields)).toEqual([]);
    expect(staffFinishRequiredPercentage(result.fields)).toBe(100);
  });
});
