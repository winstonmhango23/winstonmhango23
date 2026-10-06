import { staffRoleNav } from '@/lib/staff/role-nav';
import {
  isLegacyAccountantCompleted,
  isZeroBalanceLegacyArchive,
  sortLegacyBookingCompletedLast,
} from '@/lib/staff/legacy-booking';
import {
  LOAN_ARCHIVE_PAGE_SIZE_OPTIONS,
  archiveOutstandingMinor,
  isLegacyArchiveEligible,
} from '@/lib/staff/loan-archives';

describe('staff role navigation', () => {
  it('keeps the loan-officer generic dashboard for LOs', () => {
    const nav = staffRoleNav('LOAN_OFFICER');
    expect(nav.title).toBe('Staff');
    expect(nav.tabs.applications.href).toBeUndefined();
    expect(nav.tabs.clients.href).toBeUndefined();
    expect(nav.sidebar.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Digest', 'Applications', 'Clients', 'Loans', 'Payments'])
    );
  });

  it('gives accountants dashboard-style loan operations, not the LO digest', () => {
    const nav = staffRoleNav('ACCOUNTANT', 3);
    expect(nav.title).toBe('Accountant');
    expect(nav.tabs.clients.href).toBeNull();
    expect(nav.tabs.applications.href).toBe('/(staff)/accountant/ready-to-disburse');
    expect(nav.tabs.repayments.href).toBe('/(staff)/accountant/repayments');
    expect(nav.sidebar.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        'Dashboard',
        'Ready to disburse',
        'Disbursements',
        'Ops handoff',
        'Legacy Booking',
        'Current Journals',
        'Repayments',
      ])
    );
    expect(nav.sidebar.some((item) => item.label === 'Applications')).toBe(false);
    expect(nav.sidebar.find((item) => item.label === 'Alerts')?.badge).toBe(3);
    expect(nav.sidebar.find((item) => item.label === 'SME book')?.href).toBe(
      '/(staff)/accountant/journals?book=legacy&credit_book=SME'
    );
    expect(nav.sidebar.find((item) => item.label === 'Group book')?.href).toBe(
      '/(staff)/accountant/journals?book=legacy&credit_book=GROUP'
    );
  });

  it('gives operations officers queue, legacy, and receipt items', () => {
    const nav = staffRoleNav('OPERATIONS_OFFICER');
    expect(nav.title).toBe('Operations');
    expect(nav.tabs.loans.href).toBe('/(staff)/loans?vintage=legacy');
    expect(nav.tabs.applications.href).toBe('/(staff)/operations/ops-queue');
    expect(nav.tabs.repayments.href).toBe('/(staff)/operations/repayments');
    expect(nav.sidebar.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Dashboard', 'Legacy Booking', 'Ops queue', 'Repayments'])
    );
  });

  it('gives operations managers and assistants their own workspaces', () => {
    const manager = staffRoleNav('OPERATIONS_MANAGER');
    expect(manager.tabs.applications.href).toBe('/(staff)/operations-manager/credit-queue');
    expect(manager.tabs.repayments.href).toBe('/(staff)/operations/repayments');
    expect(manager.sidebar.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Credit queue', 'Repayment handoff', 'Repayments', 'Escalated repayments'])
    );

    const assistant = staffRoleNav('OPERATIONS_ASSISTANT');
    expect(assistant.tabs.applications.href).toBe('/(staff)/operations-assistant/reviews');
    expect(assistant.tabs.repayments.href).toBe('/(staff)/operations-assistant/repayments');
    expect(assistant.tabs.clients.href).toBeNull();
  });

  it('gives portfolio managers zone management instead of the LO digest', () => {
    const nav = staffRoleNav('PORTFOLIO_MANAGER');
    expect(nav.title).toBe('Portfolio');
    expect(nav.tabs.applications.href).toBe('/(staff)/portfolio-manager/approvals');
    expect(nav.tabs.repayments.href).toBe('/(staff)/portfolio-manager/repayments');
    expect(nav.sidebar.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        'Dashboard',
        'Approvals',
        'Loan drawdowns',
        'Zones & districts',
        'Portfolio ledger',
      ])
    );
    expect(nav.sidebar.find((item) => item.label === 'Zones & districts')?.href).toBe(
      '/(staff)/portfolio-manager/zones'
    );
    expect(nav.sidebar.some((item) => item.label === 'Digest')).toBe(false);
  });

  it('gives the CEO investment and origination sidebar, not the LO digest', () => {
    const nav = staffRoleNav('CEO', 4);
    expect(nav.title).toBe('CEO');
    expect(nav.tabs.applications.href).toBe('/(staff)/ceo/queue');
    expect(nav.tabs.repayments.href).toBe('/(staff)/ceo/repayments');
    expect(nav.sidebar.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        'Dashboard',
        'Executive approvals',
        'GCEO escalations',
        'Pending release',
        'Repayment Oversight',
        'Investment Overview',
        'Investment Funds',
        'Shareholders',
        'Investments',
        'Capital allocation',
      ])
    );
    expect(nav.sidebar.find((item) => item.label === 'Investment Overview')?.href).toBe(
      '/(staff)/investments'
    );
    expect(nav.sidebar.find((item) => item.label === 'Capital allocation')?.href).toBe(
      '/(staff)/investments/allocations'
    );
    expect(nav.sidebar.some((item) => item.label === 'Digest')).toBe(false);
    expect(nav.sidebar.find((item) => item.label === 'Alerts')?.badge).toBe(4);
  });

  it('gives the GCEO system its own sidebar and does not classify it as CEO', () => {
    const nav = staffRoleNav('GCEO');
    const ceo = staffRoleNav('CHIEF_EXECUTIVE_OFFICER');
    expect(nav.title).toBe('GCEO');
    expect(ceo.title).toBe('CEO');
    expect(nav.tabs.applications.href).toBe('/(staff)/gceo/queue');
    expect(nav.tabs.repayments.href).toBe('/(staff)/gceo/repayments');
    expect(nav.sidebar.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        'Dashboard',
        'Final approvals',
        'CEO pipeline',
        'Pending release',
        'Repayment Strategy',
        'Investment Overview',
        'Investment Funds',
        'Shareholders',
        'Investments',
        'Capital allocation',
      ])
    );
    expect(nav.sidebar.some((item) => item.label === 'Executive approvals')).toBe(false);
    expect(nav.sidebar.some((item) => item.label === 'Digest')).toBe(false);
    expect(staffRoleNav('GENERAL_CHIEF_EXECUTIVE_OFFICER').title).toBe('GCEO');
  });

  it('puts AI Studio on every dashboard role, including ops officer and assistant', () => {
    const roles = [
      'LOAN_OFFICER',
      'CREDIT_INVESTMENT_OFFICER',
      'OPERATIONS_OFFICER',
      'OPERATIONS_ASSISTANT',
      'OPERATIONS_MANAGER',
      'PORTFOLIO_MANAGER',
      'CEO',
      'GCEO',
      'ACCOUNTANT',
      'AUDITOR',
      'MONITORING_AND_EVALUATION_OFFICER',
    ];
    for (const role of roles) {
      const labels = staffRoleNav(role).sidebar.map((item) => item.label);
      expect(labels).toContain('AI Studio');
      expect(staffRoleNav(role).sidebar.find((item) => item.label === 'AI Studio')?.href).toBe(
        '/(staff)/ai-studio'
      );
    }
  });
});

describe('mobile legacy completion sort', () => {
  it('marks journaled loans completed and pushes them last', () => {
    expect(isLegacyAccountantCompleted({ legacyBookingStatus: 'booked' })).toBe(true);
    expect(isLegacyAccountantCompleted({ completionStatus: 'completed' })).toBe(true);
    expect(isLegacyAccountantCompleted({ legacyBookingStatus: 'ready_for_accountant_booking' })).toBe(
      false
    );

    const sorted = sortLegacyBookingCompletedLast([
      { id: 1, legacyBookingStatus: 'booked' },
      { id: 2, legacyBookingStatus: 'pending_operations_review' },
      { id: 3, completionStatus: 'completed', legacy_booking_status: 'accounting_posted' },
      { id: 4, legacyBookingStatus: 'ready_for_accountant_booking' },
    ]);
    expect(sorted.map((row) => row.id)).toEqual([4, 2, 1, 3]);
  });

  it('puts remaining-balance work before MWK 0 rows', () => {
    const sorted = sortLegacyBookingCompletedLast([
      { id: 1, legacyBookingStatus: 'pending_operations_review', outstanding_principal: 0 },
      { id: 2, legacyBookingStatus: 'pending_operations_review', outstanding_principal: 757_563 },
      { id: 3, legacyBookingStatus: 'pending_operations_review', outstandingBalanceMinor: 0 },
    ]);
    expect(sorted.map((row) => row.id)).toEqual([2, 1, 3]);
  });

  it('treats journaled zero-balance loans as archive rows', () => {
    expect(
      isZeroBalanceLegacyArchive({
        legacyBookingStatus: 'booked',
        outstandingBalanceMinor: 0,
      })
    ).toBe(true);
    expect(
      isZeroBalanceLegacyArchive({
        legacyBookingStatus: 'booked',
        outstandingBalanceMinor: 1200,
      })
    ).toBe(false);
    expect(
      isLegacyArchiveEligible({
        legacy_booking_status: 'booked',
        outstanding_principal: 0,
        outstanding_interest: 0,
      })
    ).toBe(true);
    expect(
      isLegacyArchiveEligible({
        legacyBookingStatus: 'booked',
        outstanding_principal: 800,
        outstanding_interest: 200,
      })
    ).toBe(false);
    expect(archiveOutstandingMinor({ outstanding_principal: 800, outstanding_interest: 200 })).toBe(1000);
    expect(LOAN_ARCHIVE_PAGE_SIZE_OPTIONS).toEqual([10, 25, 50, 100]);
  });
});
