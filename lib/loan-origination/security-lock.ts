/**
 * Active-loan security lock helpers (collateral / guarantors).
 * Matches backend: locked until loan status is CLOSED / SETTLED / WRITTEN_OFF.
 */

const UNLOCKED = new Set(['CLOSED', 'SETTLED', 'WRITTEN_OFF']);

export function isLoanSecurityLocked(status: string | null | undefined): boolean {
  const st = String(status || '').trim().toUpperCase();
  if (!st) return false;
  return !UNLOCKED.has(st);
}

export function loanSecurityLockMessage(status?: string | null): string {
  return (
    'This security is locked on an active loan until full repayment' +
    (status ? ` (status: ${status}).` : '.')
  );
}
