import { config } from '@/lib/config';
import {
  parseOverpaymentConflict,
  previewLegacyPreviousRepayments,
} from '@/lib/staff/legacy-previous-repayments';

describe('legacy previous repayments', () => {
  it('exposes the previous-repayments endpoints', () => {
    expect(config.staff.operationsOfficerPreviousRepaymentsPreview(9)).toContain(
      '/operations-officer/loans/9/previous-repayments/preview'
    );
    expect(config.staff.operationsOfficerPreviousRepayments(9)).toContain(
      '/operations-officer/loans/9/previous-repayments'
    );
  });

  it('keeps previous repayments plus remaining equal to the original total', () => {
    const preview = previewLegacyPreviousRepayments({
      remaining_minor: 40_000,
      already_recorded_minor: 60_000,
      requested_minor: 25_000,
    });
    expect(preview.original_total_minor).toBe(100_000);
    expect(preview.applied_minor).toBe(25_000);
    expect(preview.overpayment_minor).toBe(0);
    expect(preview.previous_after_minor + preview.remaining_after_minor).toBe(
      preview.original_total_minor
    );
    expect(preview.totals_match).toBe(true);
  });

  it('flags an overpayment when previous repayments exceed remaining', () => {
    const preview = previewLegacyPreviousRepayments({
      remaining_minor: 10_000,
      already_recorded_minor: 90_000,
      requested_minor: 15_000,
    });
    expect(preview.applied_minor).toBe(10_000);
    expect(preview.overpayment_minor).toBe(5_000);
    expect(parseOverpaymentConflict({
      status: 409,
      detail: {
        code: 'OVERPAYMENT',
        overpayment_minor: 5_000,
        applied_minor: 10_000,
      },
    })?.overpayment_minor).toBe(5_000);
  });
});
