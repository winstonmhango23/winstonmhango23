import { audienceForRole, type LoanProductRow } from '@/lib/loan-products/loan-products-cache';

describe('loan-products-cache', () => {
  it('maps client role to client audience', () => {
    expect(audienceForRole('client')).toBe('client');
    expect(audienceForRole('staff')).toBe('staff');
    expect(audienceForRole(null)).toBe('staff');
  });

  it('preserves numeric product id in stored shape', () => {
    const sample: LoanProductRow = {
      id: 42,
      name: 'SME Loan',
      code: 'SME-01',
      minimum_term_months: 6,
      maximum_term_months: 24,
    };
    const roundTrip = JSON.parse(JSON.stringify(sample)) as LoanProductRow;
    expect(roundTrip.id).toBe(42);
    expect(roundTrip.code).toBe('SME-01');
  });
});
