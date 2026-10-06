import { isValidAccountantReturnReason } from '@/lib/staff/accountant-schedule-return';
import { normalizeLoanScheduleRows } from '@/lib/staff/loan-schedule';

describe('loan schedule rows', () => {
  it('normalizes API installment payloads for the view-schedule modal', () => {
    const rows = normalizeLoanScheduleRows([
      {
        installment_number: 1,
        due_date: '2026-09-01',
        principal_amount: 10_000,
        interest_amount: 1_000,
        total_amount: 11_000,
        status: 'PENDING',
      },
    ]);
    expect(rows[0]).toMatchObject({
      installmentNumber: 1,
      dueDate: '2026-09-01',
      totalMinor: 11_000,
    });
    expect(normalizeLoanScheduleRows(null)).toEqual([]);
  });

  it('requires a 5-character reason before returning a loan for correction', () => {
    expect(isValidAccountantReturnReason('bad')).toBe(false);
    expect(isValidAccountantReturnReason('Fix due date')).toBe(true);
  });
});
