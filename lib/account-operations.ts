/**
 * Shared account operation rules — aligned with web client-portal Accounts.
 */

import {
  isCashCollateralCategory,
  normalizeAccountCategory,
} from '@/lib/account-categories';

export type TransferPurpose =
  | 'GENERAL'
  | 'SAVINGS_TRANSFER'
  | 'LOAN_REPAYMENT'
  | 'COLLATERAL_TRANSFER';

export const TRANSFER_PURPOSES: TransferPurpose[] = [
  'GENERAL',
  'SAVINGS_TRANSFER',
  'LOAN_REPAYMENT',
  'COLLATERAL_TRANSFER',
];

export const DEPOSIT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'MOBILE_MONEY',
  'CHEQUE',
  'DIRECT_DEBIT',
] as const;

export type DepositMethod = (typeof DEPOSIT_METHODS)[number];

export const WITHDRAWAL_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'MOBILE_MONEY',
  'CHEQUE',
  'OTHER',
] as const;

export type WithdrawalMethod = (typeof WITHDRAWAL_METHODS)[number];

/** Posted book balance — used for transfers and as withdrawable ceiling. */
export function accountBookBalanceMinor(account: { balance?: number | null }): number {
  return Math.max(0, account.balance ?? 0);
}

/**
 * Withdrawable ceiling for client-side checks.
 * Backend enforces book − locked; account list does not expose locks, so use book
 * (never pending-deposit “effective”, which can over-allow).
 */
export function accountWithdrawableBalanceMinor(account: {
  balance?: number | null;
}): number {
  return accountBookBalanceMinor(account);
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

export function destinationAccountsForPurpose<
  T extends { id: number; account_category?: string | null; status?: string | null },
>(accounts: T[], purpose: string): T[] {
  const active = accounts.filter((a) => String(a.status || '').toUpperCase() === 'ACTIVE');
  const p = purpose.toUpperCase();
  if (p === 'LOAN_REPAYMENT') {
    return active.filter((a) => {
      const c = normalizeAccountCategory(a.account_category);
      return c === 'LOAN_ACCOUNT' || c === 'REPAYMENT';
    });
  }
  if (p === 'COLLATERAL_TRANSFER') {
    return active.filter((a) => isCashCollateralCategory(a.account_category));
  }
  return active;
}

export function transferPurposeHint(purpose: string): string | null {
  switch (purpose.toUpperCase()) {
    case 'LOAN_REPAYMENT':
      return 'Choose a repayment or loan account. Staff still allocate funds to the loan after approval.';
    case 'COLLATERAL_TRANSFER':
      return 'Collateral transfers must go to the cash collateral account.';
    case 'SAVINGS_TRANSFER':
      return 'Move funds between savings sub-accounts.';
    default:
      return null;
  }
}

export function validatePositiveAmountMinor(amountMinor: number | null | undefined): string | null {
  if (amountMinor == null || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return 'Enter a valid MWK amount';
  }
  return null;
}

export function validateAmountAgainstBook(
  amountMinor: number,
  account: { balance?: number | null } | undefined,
  label = 'available book balance'
): string | null {
  const base = validatePositiveAmountMinor(amountMinor);
  if (base) return base;
  if (!account) return 'Select an account';
  const book = accountBookBalanceMinor(account);
  if (amountMinor > book) {
    return `Amount exceeds ${label}`;
  }
  return null;
}

export type DepositSubmitPayload = {
  account_id: number;
  amount_minor: number;
  deposit_method: DepositMethod;
  reference_number?: string;
  notes?: string;
  receipt_path?: string;
  receipt_metadata?: {
    receipt_number: string;
    payment_date: string;
    original_filename?: string;
  };
  /** Local URI to upload before create (online path). */
  receipt_local_uri?: string;
  receipt_file_name?: string;
};

export type WithdrawSubmitPayload = {
  account_id: number;
  amount_minor: number;
  withdrawal_method?: WithdrawalMethod;
  reference_number?: string;
  notes?: string;
};

export type TransferSubmitPayload = {
  source_account_id: number;
  destination_account_id: number;
  amount_minor: number;
  transfer_purpose: TransferPurpose;
  loan_id?: number;
  notes?: string;
};

export type FundCollateralPayload = {
  source_account_id: number;
  amount_minor: number;
};
