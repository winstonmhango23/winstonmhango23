import {
  clientApplicationDisplayStatus,
  isBorrowerEditableDraft,
} from '@/lib/loan-origination/client-application-status';

describe('clientApplicationDisplayStatus', () => {
  it('shows Draft for plain drafts', () => {
    expect(clientApplicationDisplayStatus('DRAFT', null)).toBe('Draft');
    expect(clientApplicationDisplayStatus('DRAFT', 'DRAFT')).toBe('Draft');
  });

  it('shows Submitted after borrower sends to loan officer', () => {
    expect(clientApplicationDisplayStatus('DRAFT', 'PENDING_LO_ACTION')).toBe('Submitted');
    expect(clientApplicationDisplayStatus('SUBMITTED', null)).toBe('Submitted');
  });
});

describe('isBorrowerEditableDraft', () => {
  it('allows edit only before send-to-LO (or after LO return)', () => {
    expect(isBorrowerEditableDraft('DRAFT', null)).toBe(true);
    expect(isBorrowerEditableDraft('DRAFT', 'DRAFT')).toBe(true);
    expect(isBorrowerEditableDraft('DRAFT', 'RETURNED_TO_LO')).toBe(true);
    expect(isBorrowerEditableDraft('DRAFT', 'PENDING_LO_ACTION')).toBe(false);
    expect(isBorrowerEditableDraft('SUBMITTED', null)).toBe(false);
  });
});
