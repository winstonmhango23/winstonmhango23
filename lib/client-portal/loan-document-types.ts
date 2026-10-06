/**
 * Document type codes shared with the web client portal Documents hub.
 */

export type CustomerPortalDocumentType =
  | 'ID_PROOF'
  | 'INCOME_PROOF'
  | 'ADDRESS_PROOF'
  | 'BANK_STATEMENT'
  | 'OTHER';

export const PROFILE_DOC_TYPES: { value: CustomerPortalDocumentType; label: string }[] = [
  { value: 'ID_PROOF', label: 'National ID / ID proof' },
  { value: 'INCOME_PROOF', label: 'Income proof' },
  { value: 'ADDRESS_PROOF', label: 'Proof of address' },
  { value: 'BANK_STATEMENT', label: 'Bank statement' },
  { value: 'OTHER', label: 'Other' },
];

/** Recommended loan-application doc types (aligned with portal origination-documents). */
export const LOAN_REQUEST_DOC_TYPES: { value: string; label: string }[] = [
  { value: 'NATIONAL_ID', label: 'National ID / passport' },
  { value: 'PROOF_OF_ADDRESS', label: 'Proof of address' },
  { value: 'PAYSLIP', label: 'Payslip / proof of income' },
  { value: 'BANK_STATEMENT', label: 'Bank statement' },
  { value: 'BUSINESS_REGISTRATION', label: 'Business registration' },
  { value: 'CHIEF_APPROVAL_LETTER', label: 'Village chief approval letter' },
  { value: 'LOAN_APPLICATION', label: 'Signed loan application' },
  { value: 'OTHER', label: 'Other supporting document' },
];

export function labelForProfileDocType(code: string): string {
  const k = (code || '').trim().toUpperCase();
  return PROFILE_DOC_TYPES.find((t) => t.value === k)?.label ?? k.replace(/_/g, ' ');
}

export function labelForLoanRequestDocType(code: string): string {
  const k = (code || '').trim().toUpperCase();
  return LOAN_REQUEST_DOC_TYPES.find((t) => t.value === k)?.label ?? k.replace(/_/g, ' ');
}
