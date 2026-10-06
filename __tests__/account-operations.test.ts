import {
  accountBookBalanceMinor,
  accountEffectiveBalanceMinor,
  accountWithdrawableBalanceMinor,
  destinationAccountsForPurpose,
  validateAmountAgainstBook,
} from '@/lib/account-operations';
import { config } from '@/lib/config';

describe('account balance helpers', () => {
  it('uses book balance for withdrawable (not inflated effective)', () => {
    const account = { balance: 100_00, effective_balance: 250_00 };
    expect(accountBookBalanceMinor(account)).toBe(100_00);
    expect(accountEffectiveBalanceMinor(account)).toBe(250_00);
    expect(accountWithdrawableBalanceMinor(account)).toBe(100_00);
  });

  it('validates transfer amount against book', () => {
    expect(validateAmountAgainstBook(50_00, { balance: 100_00 })).toBeNull();
    expect(validateAmountAgainstBook(150_00, { balance: 100_00 })).toMatch(/exceeds/i);
  });
});

describe('transfer destination filters', () => {
  const accounts = [
    { id: 1, account_category: 'MAIN', status: 'ACTIVE' },
    { id: 2, account_category: 'REPAYMENT', status: 'ACTIVE' },
    { id: 3, account_category: 'LOAN_ACCOUNT', status: 'ACTIVE' },
    { id: 4, account_category: 'CASH_COLLATERAL', status: 'ACTIVE' },
    { id: 5, account_category: 'MAIN', status: 'CLOSED' },
  ];

  it('filters LOAN_REPAYMENT destinations', () => {
    const dest = destinationAccountsForPurpose(accounts, 'LOAN_REPAYMENT');
    expect(dest.map((a) => a.id).sort()).toEqual([2, 3]);
  });

  it('filters COLLATERAL_TRANSFER destinations including legacy aliases', () => {
    const withLegacy = [
      ...accounts,
      { id: 6, account_category: 'CASH_COLLETERAL', status: 'ACTIVE' },
    ];
    const dest = destinationAccountsForPurpose(withLegacy, 'COLLATERAL_TRANSFER');
    expect(dest.map((a) => a.id).sort()).toEqual([4, 6]);
  });

  it('allows any active account for GENERAL', () => {
    expect(destinationAccountsForPurpose(accounts, 'GENERAL').map((a) => a.id)).toEqual([1, 2, 3, 4]);
  });
});

describe('staff savings API paths', () => {
  it('uses /savings-deposits and /savings-withdrawals (not /staff/savings/*)', () => {
    expect(config.staffSavings.deposits).toBe(`${config.apiBase}/savings-deposits`);
    expect(config.staffSavings.depositSubmit(9)).toBe(`${config.apiBase}/savings-deposits/9/submit`);
    expect(config.staffSavings.transfers).toBe(`${config.apiBase}/savings-deposits/transfers`);
    expect(config.staffSavings.withdrawals).toBe(`${config.apiBase}/savings-withdrawals`);
    expect(config.staffSavings.deposits).not.toContain('/staff/savings');
  });

  it('exposes staff client loans path for transfer loan_id', () => {
    expect(config.loans.byClient(42)).toBe(`${config.apiBase}/loans/client/42/loans`);
  });
});
