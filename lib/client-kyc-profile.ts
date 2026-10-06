/** Whether client type uses individual natural-person KYC fields. */

const INDIVIDUAL_KYC_TYPES = new Set(['INDIVIDUAL', 'SME', 'SALARY', 'SALARYBACKED']);

export function usesIndividualKycFields(clientType?: string | null): boolean {
  const t = (clientType ?? 'INDIVIDUAL').toUpperCase();
  return INDIVIDUAL_KYC_TYPES.has(t);
}
