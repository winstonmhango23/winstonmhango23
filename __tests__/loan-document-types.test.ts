import {
  labelForLoanRequestDocType,
  labelForProfileDocType,
  LOAN_REQUEST_DOC_TYPES,
  PROFILE_DOC_TYPES,
} from '@/lib/client-portal/loan-document-types';

describe('loan document type labels', () => {
  it('covers portal profile document types', () => {
    expect(PROFILE_DOC_TYPES.map((t) => t.value)).toEqual(
      expect.arrayContaining(['ID_PROOF', 'INCOME_PROOF', 'ADDRESS_PROOF', 'BANK_STATEMENT', 'OTHER'])
    );
    expect(labelForProfileDocType('id_proof')).toMatch(/ID/i);
  });

  it('covers recommended loan request document types', () => {
    expect(LOAN_REQUEST_DOC_TYPES.length).toBeGreaterThan(3);
    expect(labelForLoanRequestDocType('NATIONAL_ID')).toMatch(/National ID/i);
    expect(labelForLoanRequestDocType('UNKNOWN_CODE')).toMatch(/Unknown Code/i);
  });
});
