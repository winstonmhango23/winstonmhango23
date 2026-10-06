import {
  accountantLegacyCardTone,
  bulkJournalPercent,
  canSelectLegacyLoanForJournals,
  isReadyForAccountantJournals,
  legacyLoanDisplayLabel,
  runBulkLegacyJournals,
  selectableApprovedLegacyLoans,
  sortLegacyBookingCompletedLast,
} from '@/lib/staff/legacy-booking';

describe('mobile accountant legacy bulk journals', () => {
  it('only selects operations-approved legacy loans', () => {
    const approved = { id: 11, applicationNumber: 'LN-11', legacyBookingStatus: 'ready_for_accountant_booking' };
    const waiting = { id: 12, legacyBookingStatus: 'pending_operations_review' };
    const booked = { id: 13, legacyBookingStatus: 'booked' };
    const certified = { id: 14, certifiedForAccounting: true, legacyBookingStatus: 'certified' };

    expect(canSelectLegacyLoanForJournals(approved)).toBe(true);
    expect(canSelectLegacyLoanForJournals(waiting)).toBe(false);
    expect(canSelectLegacyLoanForJournals(booked)).toBe(false);
    expect(canSelectLegacyLoanForJournals(certified)).toBe(true);
    expect(selectableApprovedLegacyLoans([approved, waiting, booked, certified]).map((row) => row.id)).toEqual([
      11, 14,
    ]);
  });

  it('labels the current loan and computes progress', () => {
    expect(
      legacyLoanDisplayLabel({ id: 8, applicationNumber: 'LN-8', customerName: 'John Banda' })
    ).toBe('LN-8 · John Banda');
    expect(bulkJournalPercent(1, 4)).toBe(25);
  });

  it('runs sequentially and records success plus failure', async () => {
    const generate = jest.fn(async (loanId: number) => {
      if (loanId === 2) throw new Error('GL rejected');
      return { legacy_booking_status: 'booked' };
    });
    const current: string[] = [];
    const result = await runBulkLegacyJournals({
      loans: [
        { id: 1, applicationNumber: 'LN-A', customerName: 'One', legacyBookingStatus: 'ready_for_accountant_booking' },
        { id: 2, applicationNumber: 'LN-B', customerName: 'Two', legacyBookingStatus: 'ready_for_accountant_booking' },
        { id: 3, applicationNumber: 'LN-C', legacyBookingStatus: 'pending_operations_review' },
      ],
      generate,
      onProgress: (progress) => {
        if (progress.current) current.push(progress.current.label);
      },
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]?.status).toBe('booked');
    expect(current.some((label) => label.includes('LN-B'))).toBe(true);
  });

  it('sorts ready loans first and hides journal actions until operations approve', () => {
    expect(
      isReadyForAccountantJournals({
        legacyBookingStatus: 'ready_for_accountant_booking',
        certifiedForAccounting: false,
      })
    ).toBe(true);
    expect(isReadyForAccountantJournals({ legacyBookingStatus: 'pending_operations_review' })).toBe(false);
    expect(accountantLegacyCardTone({ legacyBookingStatus: 'pending_operations_review' })).toBe('waiting');
    expect(accountantLegacyCardTone({ legacyBookingStatus: 'ready_for_accountant_booking' })).toBe('ready');
    expect(accountantLegacyCardTone({ legacyBookingStatus: 'booked' })).toBe('completed');

    const sorted = sortLegacyBookingCompletedLast([
      { id: 1, legacyBookingStatus: 'booked' },
      { id: 2, legacyBookingStatus: 'pending_operations_review' },
      { id: 3, legacyBookingStatus: 'ready_for_accountant_booking' },
      { id: 4, certifiedForAccounting: true, legacyBookingStatus: 'certified' },
    ]);
    expect(sorted.map((row) => row.id)).toEqual([3, 4, 2, 1]);
  });
});
