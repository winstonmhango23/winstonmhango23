/**
 * Staff KYC update body — organization clients must not require personal ID fields.
 */

import {
  buildStaffClientUpdateBody,
  isPersonalKycRequiredError,
} from '@/lib/staff/client-kyc-update';
import type { ClientKYCData } from '@/lib/client-portal/kyc-completion-calculator';

const groupKyc: ClientKYCData = {
  client_type: 'GROUP',
  phone_number: '+265991111111',
  address: 'Mzuzu',
  registration_date: '2020-01-10',
  group_constitution_path: '/uploads/constitution.pdf',
  chairperson_name: 'Chair A',
  chairperson_phone: '+265991111112',
  secretary_name: 'Sec B',
  secretary_phone: '+265991111113',
  treasurer_name: 'Treas C',
  treasurer_phone: '+265991111114',
  group_purpose: 'Savings',
  meeting_schedule: 'Weekly',
  member_count: 10,
  // Stale personal fields that must be cleared for org clients
  national_id: 'SHOULD-CLEAR',
  gender: 'M',
  occupation: 'Trader',
  id_document_path: '/uploads/id.jpg',
};

describe('buildStaffClientUpdateBody', () => {
  it('clears personal KYC fields for GROUP finished profiles', () => {
    const body = buildStaffClientUpdateBody(groupKyc, {}, {
      saveMode: 'finished',
      clientType: 'GROUP',
      fullName: 'Village Savings Group',
    });

    expect(body.client_type).toBe('GROUP');
    expect(body.save_mode).toBe('finished');
    expect(body.is_verified).toBe(true);
    expect(body.organization_name).toBe('Village Savings Group');
    expect(body.chairperson_name).toBe('Chair A');
    expect(body.group_constitution_path).toBe('/uploads/constitution.pdf');
    expect(body.national_id).toBeNull();
    expect(body.date_of_birth).toBeNull();
    expect(body.gender).toBeNull();
    expect(body.occupation).toBeNull();
    expect(body.id_document_path).toBeNull();
    expect(body.profile_photo_path).toBeNull();
  });

  it('uses organization rules for COOPERATIVE', () => {
    const body = buildStaffClientUpdateBody(
      { ...groupKyc, client_type: 'COOPERATIVE' },
      {},
      { saveMode: 'draft', clientType: 'COOPERATIVE', fullName: 'Coop One' }
    );
    expect(body.client_type).toBe('COOPERATIVE');
    expect(body.is_verified).toBe(false);
    expect(body.national_id).toBeNull();
    expect(body.chairperson_name).toBe('Chair A');
  });

  it('includes personal KYC for SME (not organization KYC)', () => {
    const body = buildStaffClientUpdateBody(
      {
        client_type: 'SME',
        national_id: 'MW123',
        date_of_birth: '1990-01-01',
        gender: 'F',
        occupation: 'Shop owner',
        marital_status: 'SINGLE',
        phone_number: '+265990000000',
        address: 'Lilongwe',
        id_document_path: '/uploads/id-front.jpg',
        community_type: 'Town',
      },
      { id_document_path: '/uploads/id-front.jpg' },
      { saveMode: 'finished', clientType: 'SME', fullName: 'Banda Traders' }
    );
    expect(body.national_id).toBe('MW123');
    expect(body.occupation).toBe('Shop owner');
    expect(body.id_document_path).toBe('/uploads/id-front.jpg');
    expect(body.organization_name).toBe('Banda Traders');
  });
});

describe('isPersonalKycRequiredError', () => {
  it('detects backend finished-profile errors listing personal fields', () => {
    expect(
      isPersonalKycRequiredError(
        'complete all required fields before marking the profile as finished. Missing : National ID/Passport number, date of birth, ID Document(Front), Gender, Occupation.'
      )
    ).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isPersonalKycRequiredError('Network request failed')).toBe(false);
    expect(isPersonalKycRequiredError('Missing branch assignment')).toBe(false);
  });
});
