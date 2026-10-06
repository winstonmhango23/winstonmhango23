import { config } from '@/lib/config';
import {
  beneficiaryDisplayRows,
  computeDrawdownEditorStep,
  hasLoanDrawdownBlocker,
  kycBeneficiaryHasPayee,
  normalizeDrawdownList,
  selectActiveLoanDrawdown,
  staffDrawdownEditorHref,
  trancheTotalMinor,
  tranchesMatchApprovedAmount,
  unwrapLoanDrawdown,
} from '@/lib/staff/loan-drawdown';
import { staffApplicationWorkspaceHref, staffDrawdownEditorHref as queueHref } from '@/lib/staff/role-queues';

describe('PM mobile drawdown editor', () => {
  it('exposes application-scoped drawdown APIs', () => {
    expect(config.staff.portfolioManagerLoanDrawdowns(12)).toContain(
      '/portfolio-manager/applications/12/loan-drawdowns'
    );
    expect(config.staff.portfolioManagerLoanDrawdown(12, 4)).toContain(
      '/portfolio-manager/applications/12/loan-drawdowns/4'
    );
    expect(config.staff.portfolioManagerLoanDrawdownApprove(12, 4)).toContain(
      '/portfolio-manager/applications/12/loan-drawdowns/4/approve'
    );
    expect(config.staff.portfolioManagerKycBeneficiary(12)).toContain(
      '/portfolio-manager/applications/12/kyc-beneficiary'
    );
    expect(config.staff.portfolioManagerRefreshDrawdownBeneficiary(12, 4)).toContain(
      '/refresh-beneficiary-from-kyc'
    );
    expect(config.staff.portfolioManagerDrawdownAttest(4)).toContain(
      '/portfolio-manager/loan-drawdowns/4/verification-attestation'
    );
  });

  it('opens a dedicated editor instead of a second loan file', () => {
    expect(staffDrawdownEditorHref(18)).toBe('/(staff)/portfolio-manager/drawdowns/18');
    expect(queueHref(18)).toBe('/(staff)/portfolio-manager/drawdowns/18');
    expect(staffApplicationWorkspaceHref(18)).toBe('/(staff)/applications/18');
  });

  it('prefers an open draft over approved or cancelled rows', () => {
    const active = selectActiveLoanDrawdown([
      { id: 1, status: 'CANCELLED' },
      { id: 2, status: 'APPROVED', ld_number: 'LD-2' },
      { id: 3, status: 'DRAFT', ld_number: 'LD-3' },
    ]);
    expect(active?.id).toBe(3);
    expect(selectActiveLoanDrawdown([{ id: 9, status: 'CANCELLED' }])).toBeNull();
  });

  it('walks the editor steps from missing draft to ready', () => {
    expect(computeDrawdownEditorStep({ hasApplication: false })).toBe('review');
    expect(computeDrawdownEditorStep({ hasApplication: true, drawdown: null })).toBe('create');
    expect(
      computeDrawdownEditorStep({
        hasApplication: true,
        drawdown: { id: 1, status: 'DRAFT', draw_tranches: [] },
        approvedAmountMinor: 1_000_000,
      })
    ).toBe('tranches');
    expect(
      computeDrawdownEditorStep({
        hasApplication: true,
        approvedAmountMinor: 500_000,
        drawdown: {
          id: 1,
          status: 'DRAFT',
          draw_tranches: [{ amount_minor: 500_000 }],
          beneficiary: { source: 'CLIENT_KYC' },
        },
      })
    ).toBe('payee');
    expect(
      computeDrawdownEditorStep({
        hasApplication: true,
        approvedAmountMinor: 500_000,
        drawdown: {
          id: 1,
          status: 'DRAFT',
          draw_tranches: [{ amount_minor: 500_000 }],
          beneficiary: { account_name: 'John Banda', bank_name: 'NBM' },
        },
      })
    ).toBe('approve');
    expect(
      computeDrawdownEditorStep({
        hasApplication: true,
        approvedAmountMinor: 500_000,
        drawdown: {
          id: 1,
          status: 'APPROVED',
          draw_tranches: [{ amount_minor: 500_000 }],
          beneficiary: { account_name: 'John Banda', bank_name: 'NBM' },
        },
      })
    ).toBe('contract');
  });

  it('exposes drawdown branding settings and logo endpoints', () => {
    expect(config.staff.portfolioManagerDrawdownSettings).toContain(
      '/portfolio-manager/drawdown-settings'
    );
    expect(config.staff.portfolioManagerDrawdownSettingsLogo).toContain(
      '/portfolio-manager/drawdown-settings/logo'
    );
    expect(config.staff.portfolioManagerFundingPools).toContain('/portfolio-manager/funding-pools');
    expect(config.staff.portfolioManagerDrawdownHistory).toContain(
      '/portfolio-manager/applications/drawdown-history'
    );
    expect(config.staff.portfolioManagerLoanDrawdownCancel(12, 4)).toContain(
      '/portfolio-manager/applications/12/loan-drawdowns/4/cancel'
    );
    expect(config.staff.portfolioManagerLoanDrawdownContractPdf(12, 4)).toContain(
      '/request-contract-pdf'
    );
  });

  it('keeps tranche totals in minor units', () => {
    expect(
      trancheTotalMinor([
        { amount_minor: 200_000_000 },
        { amount_minor: 50_000_000 },
      ])
    ).toBe(250_000_000);
    expect(tranchesMatchApprovedAmount(250_000_000, [{ amount_minor: 250_000_000 }])).toBe(true);
    expect(tranchesMatchApprovedAmount(250_000_000, [{ amount_minor: 100_000_000 }])).toBe(false);
    expect(tranchesMatchApprovedAmount(0, [{ amount_minor: 10_000 }])).toBe(true);
  });

  it('reads KYC payee fields and unwraps create envelopes', () => {
    expect(kycBeneficiaryHasPayee({ account_name: 'Amina Phiri' })).toBe(true);
    expect(kycBeneficiaryHasPayee({ source: 'CLIENT_KYC' })).toBe(false);
    expect(
      beneficiaryDisplayRows({
        account_name: 'Amina Phiri',
        bank_name: 'Standard Bank',
        notes: 'ignore',
      })
    ).toEqual([
      { key: 'account_name', label: 'Account name', value: 'Amina Phiri' },
      { key: 'bank_name', label: 'Bank', value: 'Standard Bank' },
    ]);
    expect(unwrapLoanDrawdown({ success: true, drawdown: { id: 7, ld_number: 'LD-7' } })?.id).toBe(7);
    expect(normalizeDrawdownList({ items: [{ id: 2, status: 'DRAFT' }] })).toHaveLength(1);
  });

  it('detects the origination drawdown blocker', () => {
    expect(hasLoanDrawdownBlocker({ blockers: ['LOAN_DRAWDOWN_REQUIRED'] } as never)).toBe(true);
    expect(hasLoanDrawdownBlocker({ blocker_details: ['loan_drawdown_required'] } as never)).toBe(
      true
    );
    expect(hasLoanDrawdownBlocker({ blockers: ['COLLATERAL'] } as never)).toBe(false);
  });
});
