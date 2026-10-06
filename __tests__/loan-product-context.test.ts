import { inferFormTypeFromProduct } from '@/lib/loan-product-context';

describe('inferFormTypeFromProduct', () => {
  it('maps SALARY_BACKED category to INDIVIDUAL', () => {
    expect(inferFormTypeFromProduct('SALARY_BACKED')).toBe('INDIVIDUAL');
    expect(inferFormTypeFromProduct('salary-backed')).toBe('INDIVIDUAL');
  });

  it('prefers salary over sme in product name', () => {
    expect(inferFormTypeFromProduct(undefined, 'SME Salary Backed Loan')).toBe('INDIVIDUAL');
  });

  it('keeps plain SME products as SME', () => {
    expect(inferFormTypeFromProduct('SME', 'ISME Growth Loan')).toBe('SME');
    expect(inferFormTypeFromProduct(undefined, 'ISME Growth Loan')).toBe('SME');
  });
});
