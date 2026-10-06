import {
  resolveStaffClientParentHref,
  sanitizeStaffReturnTo,
} from '@/lib/staff/staff-parent-navigation';

describe('staff parent navigation', () => {
  it('sends KYC back to the originating application when returnTo is present', () => {
    expect(
      resolveStaffClientParentHref({
        clientId: '5',
        section: 'edit-kyc',
        returnTo: '/(staff)/applications/9',
      })
    ).toBe('/(staff)/applications/9');
  });

  it('sends KYC back to the client profile when opened from the file itself', () => {
    expect(resolveStaffClientParentHref({ clientId: '5', section: 'edit-kyc' })).toBe(
      '/(staff)/clients/5'
    );
  });

  it('sends the client overview back to the staff clients list', () => {
    expect(resolveStaffClientParentHref({ clientId: '5' })).toBe('/(staff)/clients');
  });

  it('rejects off-site return targets', () => {
    expect(sanitizeStaffReturnTo('https://evil.example')).toBeNull();
    expect(sanitizeStaffReturnTo('//evil.example')).toBeNull();
  });
});
