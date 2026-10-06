/** Mirrors dashboard client-portal-account-categories for mobile borrower accounts. */

const CASH_COLLATERAL_ALIASES = new Set(['CASH_COLLETERAL', 'CASH_GUARANTEE', 'CASH_COLLATERAL']);

export function normalizeAccountCategory(category: string | null | undefined): string {
  const key = String(category || '').trim().toUpperCase();
  if (CASH_COLLATERAL_ALIASES.has(key)) return 'CASH_COLLATERAL';
  return key;
}

export function isCashCollateralCategory(category: string | null | undefined): boolean {
  return CASH_COLLATERAL_ALIASES.has(String(category || '').trim().toUpperCase());
}

export function isWithdrawableCategory(category: string | null | undefined): boolean {
  const n = normalizeAccountCategory(category);
  return n === 'MAIN' || n === 'SAVINGS' || n === 'REPAYMENT';
}

/**
 * Withdrawable ceiling for client-side checks.
 * Use book balance — pending-deposit “effective” must not inflate spendable funds.
 * (Backend still subtracts locked_balance when present.)
 */
export function accountWithdrawableBalanceMinor(account: {
  balance?: number | null;
  effective_balance?: number | null;
}): number {
  return Math.max(0, account.balance ?? 0);
}

export function accountBookBalanceMinor(account: { balance?: number | null }): number {
  return Math.max(0, account.balance ?? 0);
}

export function accountEffectiveBalanceMinor(account: {
  balance?: number | null;
  effective_balance?: number | null;
}): number {
  if (typeof account.effective_balance === 'number' && Number.isFinite(account.effective_balance)) {
    return Math.max(0, account.effective_balance);
  }
  return accountBookBalanceMinor(account);
}

export function categoryLabel(category: string | null | undefined): string {
  const n = normalizeAccountCategory(category);
  const map: Record<string, string> = {
    MAIN: 'Main savings',
    SAVINGS: 'Savings',
    CASH_COLLATERAL: 'Cash collateral',
    REPAYMENT: 'Repayment holding',
    LOAN_ACCOUNT: 'Loan account',
    MEMBER_COLLATERAL: 'Member collateral',
    MEMBER_REPAYMENT: 'Member repayment',
  };
  return map[n] ?? (n || 'Account');
}
