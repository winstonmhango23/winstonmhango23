import {
  isLoanSecurityLocked,
  loanSecurityLockMessage,
} from '@/lib/loan-origination/security-lock';
import { config } from '@/lib/config';

describe('loan security lock', () => {
  it('locks active and disbursed loans', () => {
    expect(isLoanSecurityLocked('ACTIVE')).toBe(true);
    expect(isLoanSecurityLocked('DISBURSED')).toBe(true);
    expect(isLoanSecurityLocked('DELINQUENT')).toBe(true);
  });

  it('unlocks closed settled written-off', () => {
    expect(isLoanSecurityLocked('CLOSED')).toBe(false);
    expect(isLoanSecurityLocked('SETTLED')).toBe(false);
    expect(isLoanSecurityLocked('WRITTEN_OFF')).toBe(false);
  });

  it('exposes staff attach-from-library paths', () => {
    expect(config.mobile.staffAttachVaultCollateral(9, 3)).toContain(
      '/loans/applications/9/collateral/attach-from-vault/3'
    );
    expect(config.mobile.staffAttachCatalogGuarantor(9, 4)).toContain(
      '/loans/applications/9/guarantors/attach-from-catalog/4'
    );
    expect(loanSecurityLockMessage('ACTIVE')).toContain('ACTIVE');
  });
});
