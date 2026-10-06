import {
  staffClientDocumentsHref,
  staffClientKycHref,
  staffClientProfileHref,
} from '@/lib/staff/client-file-links';

describe('staff client file links', () => {
  it('opens the same client file from origination and KYC screens', () => {
    expect(staffClientProfileHref(18)).toBe('/(staff)/clients/18');
    expect(staffClientKycHref(18)).toBe('/(staff)/clients/18/edit-kyc');
    expect(staffClientDocumentsHref(18)).toBe('/(staff)/clients/18/documents');
  });

  it('carries returnTo so KYC back can reopen the originating application', () => {
    expect(staffClientKycHref(18, { returnTo: '/(staff)/applications/9' })).toBe(
      '/(staff)/clients/18/edit-kyc?returnTo=%2F(staff)%2Fapplications%2F9'
    );
  });
});
