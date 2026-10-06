import { config } from '@/lib/config';
import {
  currentRepaymentBucketCounts,
  legacyBookToActionItems,
  legacyCreditBookLabel,
  legacyRepaymentUrgencyLabel,
  normalizeLegacyCreditBook,
  mergeCurrentRepaymentLoans,
  overviewRowMatchesSearch,
  overviewToStaffLoan,
  selectCurrentRepaymentBucket,
  sortLegacyRepaymentsByUrgency,
} from '@/lib/staff/legacy-repayment-book';

const today = new Date(2026, 7, 27);

describe('legacy repayment book helpers', () => {
  it('exposes the FastAPI legacy-book path', () => {
    expect(config.repayments.legacyBook).toContain('/repayments/legacy-book');
  });

  it('normalizes SME, Group, and Agricultural subcategory books', () => {
    expect(normalizeLegacyCreditBook('msme')).toBe('SME');
    expect(normalizeLegacyCreditBook('group')).toBe('GROUP');
    expect(normalizeLegacyCreditBook('agri')).toBe('AGRICULTURAL');
    expect(legacyCreditBookLabel('SME')).toBe('SME');
    expect(legacyCreditBookLabel('GROUP')).toBe('Group');
    expect(legacyCreditBookLabel('agriculture')).toBe('Agricultural');
  });

  it('sorts overdue and due-today above far-off schedules', () => {
    const ordered = sortLegacyRepaymentsByUrgency(
      [
        {
          id: 4,
          loan_account_number: 'LN-4',
          client_id: 1,
          outstanding_principal: 1,
          days_in_arrears: 0,
          next_due_date: '2026-11-25',
        },
        {
          id: 2,
          loan_account_number: 'LN-2',
          client_id: 1,
          outstanding_principal: 1,
          days_in_arrears: 0,
          next_due_date: '2026-08-27',
        },
        {
          id: 1,
          loan_account_number: 'LN-1',
          client_id: 1,
          outstanding_principal: 1,
          days_in_arrears: 12,
          next_due_date: '2026-08-15',
        },
        {
          id: 5,
          loan_account_number: 'LN-5',
          client_id: 1,
          outstanding_principal: 1,
          days_in_arrears: 40,
          next_due_date: '2026-07-18',
        },
        {
          id: 3,
          loan_account_number: 'LN-3',
          client_id: 1,
          outstanding_principal: 1,
          days_in_arrears: 0,
          next_due_date: '2026-08-30',
        },
      ],
      today
    );
    expect(ordered.map((row) => row.id)).toEqual([5, 1, 2, 3, 4]);
    expect(legacyRepaymentUrgencyLabel(ordered[0], today)).toBe('Overdue');
    expect(legacyRepaymentUrgencyLabel(ordered[2], today)).toBe('Due today');
    expect(legacyBookToActionItems(ordered)[0]?.meta).toContain('Overdue');
  });

  it('exposes the start-tracking endpoint and flags pending schedules', () => {
    expect(config.staff.operationsOfficerStartLegacyTracking(42)).toContain(
      '/operations-officer/legacy-booking/42/start-repayment-tracking'
    );
    const items = legacyBookToActionItems([
      {
        id: 7,
        loan_account_number: 'LN-7',
        client_id: 1,
        outstanding_principal: 1,
        schedule_tracking_pending: true,
      },
      {
        id: 8,
        loan_account_number: 'LN-8',
        client_id: 1,
        outstanding_principal: 1,
        schedule_tracking_pending: false,
      },
    ]);
    const pending = items.find((item) => item.id === '7');
    const started = items.find((item) => item.id === '8');
    expect(pending?.scheduleTrackingPending).toBe(true);
    expect(pending?.meta).toContain('Awaiting tracking start');
    expect(started?.scheduleTrackingPending).toBe(false);
    expect(started?.meta).not.toContain('Awaiting tracking start');
  });

  it('maps a book row onto the staff repayment modal loan', () => {
    const loan = overviewToStaffLoan({
      id: 9,
      loan_account_number: 'LN-9',
      client_id: 4,
      client_name: 'Ada',
      product_name: 'SME',
      outstanding_principal: 150_000,
      next_due_date: '2026-09-01',
      days_in_arrears: 2,
      status: 'ACTIVE',
    });
    expect(loan.id).toBe(9);
    expect(loan.client_id).toBe(4);
    expect(loan.outstanding_principal).toBe(150_000);
    expect(loan.next_due_date).toBe('2026-09-01');
  });

  it('merges current due, overdue, and upcoming loans without duplicates', () => {
    const due = [{ id: 2, loan_account_number: 'LN-2', client_id: 1, outstanding_principal: 1 }];
    const overdue = [{ id: 1, loan_account_number: 'LN-1', client_id: 1, outstanding_principal: 1 }];
    const upcoming = [
      { id: 2, loan_account_number: 'LN-2', client_id: 1, outstanding_principal: 1 },
      { id: 3, loan_account_number: 'LN-3', client_id: 1, outstanding_principal: 1 },
    ];
    expect(mergeCurrentRepaymentLoans(due, overdue, upcoming).map((row) => row.id)).toEqual([1, 2, 3]);
  });

  it('filters current-loan buckets and matches loan or client search', () => {
    const due = [{ id: 2, loan_account_number: 'LN-2', client_id: 1, client_name: 'Ada', outstanding_principal: 1 }];
    const overdue = [
      { id: 1, loan_account_number: 'LN-1', client_id: 1, client_name: 'Ben', outstanding_principal: 1 },
    ];
    const upcoming = [
      { id: 3, loan_account_number: 'LN-3', client_id: 1, client_name: 'Ada', outstanding_principal: 1 },
    ];
    expect(currentRepaymentBucketCounts(due, overdue, upcoming)).toEqual({
      all: 3,
      overdue: 1,
      due_today: 1,
      upcoming: 1,
    });
    expect(selectCurrentRepaymentBucket(due, overdue, upcoming, 'overdue').map((row) => row.id)).toEqual([
      1,
    ]);
    expect(selectCurrentRepaymentBucket(due, overdue, upcoming, 'due_today').map((row) => row.id)).toEqual([
      2,
    ]);
    expect(overviewRowMatchesSearch(due[0], 'ada')).toBe(true);
    expect(overviewRowMatchesSearch(overdue[0], 'ln-2')).toBe(false);
    expect(overviewRowMatchesSearch(upcoming[0], '3')).toBe(true);
  });
});
