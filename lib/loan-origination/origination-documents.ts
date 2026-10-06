/**
 * Human-readable labels for loan application document types (LoanDocument.doc_type).
 */

const LABELS: Record<string, string> = {
  LOAN_APPLICATION: 'Signed loan application',
  NATIONAL_ID: 'National ID / passport',
  PROOF_OF_ADDRESS: 'Proof of address',
  PAYSLIP: 'Payslip / proof of income',
  BANK_STATEMENT: 'Bank statement',
  TAX_CERTIFICATE: 'Tax certificate',
  BUSINESS_REGISTRATION: 'Business registration',
  CHIEF_APPROVAL_LETTER: 'Letter of approval from the village chief',
  COLLATERAL_VALUATION: 'Collateral valuation',
  CREDIT_REPORT: 'Credit report',
  OTHER: 'Other supporting document',
};

export function labelForLoanDocType(code: string): string {
  const k = (code || '').trim().toUpperCase();
  return LABELS[k] || k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
