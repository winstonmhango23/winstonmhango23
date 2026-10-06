/**
 * Client auth / KYC routing — prevents dashboard ↔ KYC redirect loops.
 */

import {
  isClientKycCompleteForRouting,
  resolveClientAuthDestination,
  shouldBlockClientDashboard,
  withOptimisticKycSession,
} from '@/lib/client-portal/kyc-routing';
import type { MobileClientSessionContext } from '@/lib/data/api';

function session(
  overrides: Partial<MobileClientSessionContext> = {}
): MobileClientSessionContext {
  return {
    client_id: 1,
    full_name: 'Test Client',
    client_type: 'INDIVIDUAL',
    dashboard_mode: 'individual',
    can_provision_member_credentials: false,
    can_record_group_repayments: false,
    kyc_is_complete: false,
    has_existing_loans: false,
    ...overrides,
  };
}

const completeKyc = {
  client_type: 'INDIVIDUAL',
  national_id: 'MW123456',
  date_of_birth: '1990-05-15',
  gender: 'M',
  marital_status: 'SINGLE',
  profile_photo_path: '/uploads/profile.jpg',
  id_document_path: '/uploads/id-front.jpg',
  email: 'client@cofi.mw',
  phone_number: '+265991234567',
  address: 'Lilongwe Area 25',
  occupation: 'Trader',
  next_of_kin_name: 'Jane Banda',
  next_of_kin_phone: '+265992345678',
  next_of_kin_relationship: 'Spouse',
};

describe('client KYC routing', () => {
  it('routes to dashboard when local KYC is complete even if session flag lags', () => {
    const s = session({ kyc_is_complete: false });
    expect(isClientKycCompleteForRouting(s, completeKyc)).toBe(true);
    expect(shouldBlockClientDashboard(s, completeKyc)).toBe(false);
    expect(resolveClientAuthDestination(s, completeKyc)).toBe('/(client)');
  });

  it('optimistically marks session complete after KYC submit', () => {
    const s = session({ kyc_is_complete: false, kyc_completion_percentage: 40 });
    const next = withOptimisticKycSession(s, completeKyc);
    expect(next.kyc_is_complete).toBe(true);
    expect(resolveClientAuthDestination(next, completeKyc)).toBe('/(client)');
  });

  it('still blocks new borrowers with incomplete KYC', () => {
    const s = session();
    expect(shouldBlockClientDashboard(s, { national_id: 'x' })).toBe(true);
    expect(resolveClientAuthDestination(s, {})).toBe('/kyc');
  });
});
