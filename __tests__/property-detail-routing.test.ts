import { parsePropertyDetailSource, propertyDetailHref } from '@/lib/property-detail-routing';

describe('property detail routing', () => {
  it('builds staff loan property href', () => {
    const href = propertyDetailHref(42, { kind: 'loan', loanId: 7 }, 'staff');
    expect(href).toContain('/(staff)/property/42');
    expect(href).toContain('kind=loan');
    expect(href).toContain('loanId=7');
  });

  it('builds client vault href', () => {
    const href = propertyDetailHref(9, { kind: 'borrower-vault' }, 'client');
    expect(href).toContain('/(client)/property/9');
    expect(href).toContain('kind=borrower-vault');
  });

  it('parses application source params', () => {
    const source = parsePropertyDetailSource({
      kind: 'application',
      applicationId: '15',
    });
    expect(source).toEqual({ kind: 'application', applicationId: 15 });
  });

  it('returns null for invalid source', () => {
    expect(parsePropertyDetailSource({ kind: 'loan' })).toBeNull();
  });
});
