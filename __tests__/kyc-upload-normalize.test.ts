import { normalizeKycUploadPath } from '@/lib/client-portal/api';
import { buildDocumentViewerHref } from '@/lib/media/open-document-viewer';
import { resolveStaffClientListScope } from '@/lib/staff/client-list-scope';

describe('normalizeKycUploadPath', () => {
  it('accepts path / key / url shapes', () => {
    expect(normalizeKycUploadPath({ path: 'uploads/kyc/a.jpg' })).toBe('uploads/kyc/a.jpg');
    expect(normalizeKycUploadPath({ key: 'uploads/kyc/b.jpg' })).toBe('uploads/kyc/b.jpg');
    expect(normalizeKycUploadPath({ file_path: 'kyc/c.jpg' })).toBe('kyc/c.jpg');
  });

  it('strips leading slash and host prefix', () => {
    expect(normalizeKycUploadPath({ path: '/uploads/kyc/d.jpg' })).toBe('uploads/kyc/d.jpg');
    expect(
      normalizeKycUploadPath({
        url: 'https://cofi-bms-api-production.up.railway.app/uploads/kyc/e.jpg',
      })
    ).toBe('uploads/kyc/e.jpg');
  });

  it('reads nested file objects', () => {
    expect(normalizeKycUploadPath({ file: { path: 'uploads/kyc/nested.jpg' } })).toBe(
      'uploads/kyc/nested.jpg'
    );
  });

  it('throws when path missing', () => {
    expect(() => normalizeKycUploadPath({})).toThrow(/no file path/i);
  });
});

describe('buildDocumentViewerHref', () => {
  it('passes uri without pre-encoding and keeps name', () => {
    const href = buildDocumentViewerHref({
      uri: 'uploads/kyc/id.jpg',
      name: 'National ID',
      docType: 'ID_FRONT',
    });
    expect(href.pathname).toBe('/documents/[id]');
    expect(href.params.uri).toContain('uploads/kyc/id.jpg');
    expect(href.params.name).toBe('National ID');
    expect(href.params.docType).toBe('ID_FRONT');
    expect(href.params.id).toBe('preview');
  });
});

describe('resolveStaffClientListScope', () => {
  it('keeps loan officers on assigned book', () => {
    expect(resolveStaffClientListScope('LOAN_OFFICER')).toEqual({
      assignedToMe: true,
      allBranchClients: false,
      completedOnlyBranchWide: false,
      cioSupervisedPortfolio: false,
    });
  });

  it('scopes CIO to supervised portfolio (not branch-wide)', () => {
    expect(resolveStaffClientListScope('CREDIT_INVESTMENT_OFFICER')).toEqual({
      assignedToMe: false,
      allBranchClients: false,
      completedOnlyBranchWide: false,
      cioSupervisedPortfolio: true,
    });
  });

  it('scopes SCIO to the same zone client book', () => {
    expect(resolveStaffClientListScope('SENIOR_CREDIT_INVESTMENT_OFFICER').cioSupervisedPortfolio).toBe(
      true
    );
  });

  it('opens branch-wide for managers / compliance', () => {
    expect(resolveStaffClientListScope('BRANCH_MANAGER').assignedToMe).toBe(false);
    expect(resolveStaffClientListScope('BRANCH_MANAGER').allBranchClients).toBe(true);
    expect(resolveStaffClientListScope('COMPLIANCE_OFFICER').allBranchClients).toBe(true);
    expect(resolveStaffClientListScope('ADMIN').allBranchClients).toBe(true);
  });

  it('honors view-all permission', () => {
    expect(
      resolveStaffClientListScope('LOAN_OFFICER', (code) => code === 'client:view_all')
    ).toEqual({
      assignedToMe: false,
      allBranchClients: true,
      completedOnlyBranchWide: false,
      cioSupervisedPortfolio: false,
    });
  });
});
