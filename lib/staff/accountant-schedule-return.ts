export const ACCOUNTANT_RETURN_REASON_MIN = 5;

export function isValidAccountantReturnReason(reason: string): boolean {
  return typeof reason === 'string' && reason.trim().length >= ACCOUNTANT_RETURN_REASON_MIN;
}
