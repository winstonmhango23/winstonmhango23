import { canStaffActivateOrVerifyClient } from '@/lib/staff/client-activation';
import { canProvisionGroupMemberCredentials } from '@/lib/client-portal/session-gates';

describe('canStaffActivateOrVerifyClient', () => {
  const allow = () => true;
  const deny = () => false;

  it('rejects non-staff users', () => {
    expect(
      canStaffActivateOrVerifyClient({ role: 'client', backendRole: 'CUSTOMER' }, allow)
    ).toBe(false);
    expect(canStaffActivateOrVerifyClient(null, allow)).toBe(false);
  });

  it('allows staff with client:approve', () => {
    expect(
      canStaffActivateOrVerifyClient({ role: 'staff', backendRole: 'TELLER' }, (c) => c === 'client:approve')
    ).toBe(true);
  });

  it('allows loan officer by backend role without explicit permission', () => {
    expect(
      canStaffActivateOrVerifyClient({ role: 'staff', backendRole: 'LOAN_OFFICER' }, deny)
    ).toBe(true);
    expect(
      canStaffActivateOrVerifyClient({ role: 'staff', backendRole: 'loan-officer' }, deny)
    ).toBe(true);
  });

  it('rejects staff without permission or eligible role', () => {
    expect(
      canStaffActivateOrVerifyClient({ role: 'staff', backendRole: 'TELLER' }, deny)
    ).toBe(false);
  });
});

describe('canProvisionGroupMemberCredentials', () => {
  it('always false — borrowers cannot activate accounts', () => {
    expect(
      canProvisionGroupMemberCredentials({
        can_provision_member_credentials: true,
      } as never)
    ).toBe(false);
  });
});
