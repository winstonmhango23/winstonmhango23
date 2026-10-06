import { resolveLoanFormPayload } from '@/lib/loan-origination/form-fallback';

describe('resolveLoanFormPayload', () => {
  it('returns bundled INDIVIDUAL fields when API payload is empty', () => {
    const schema = resolveLoanFormPayload({ fields: [], form_type: 'INDIVIDUAL' }, {
      category: 'CASH',
      productName: 'Personal Loan',
    });
    expect(schema.fields.length).toBeGreaterThan(0);
    expect(schema.fields.some((f) => f.key === 'loan_requested_mwk')).toBe(true);
    expect(schema.fields.some((f) => f.key === 'loan_purpose')).toBe(true);
  });

  it('keeps API fields when present', () => {
    const api = {
      form_type: 'INDIVIDUAL',
      label: 'Test',
      sections: [],
      fields: [{ key: 'loan_requested_mwk', label: 'Amount', type: 'number', section: 'loan' }],
    };
    const schema = resolveLoanFormPayload(api, { category: 'CASH' });
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0].key).toBe('loan_requested_mwk');
  });

  it('falls back from null API data using product name hints', () => {
    const schema = resolveLoanFormPayload(null, {
      category: undefined,
      productName: 'ISME Growth Loan',
    });
    expect(schema.form_type).toBe('SME');
    expect(schema.fields.length).toBeGreaterThan(0);
  });
});
