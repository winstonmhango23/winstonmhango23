import {
  buildLoanListQuery,
  isolateAgriculturalFilter,
  isolateCreditBook,
  nextLoanListPage,
  vintageToLegacyFlag,
} from '@/lib/staff/loan-book-filters';
import { normalizeOpsLegacyQueue } from '@/lib/staff/ops-legacy-queue';

describe('staff loan book isolation', () => {
  it('maps ops legacy chips onto verification, accountant, and archive queues', () => {
    expect(normalizeOpsLegacyQueue('needs_verification')).toBe('needs_verification');
    expect(normalizeOpsLegacyQueue('certified')).toBe('sent_to_accountant');
    expect(normalizeOpsLegacyQueue('archive')).toBe('archive');
    expect(normalizeOpsLegacyQueue('active')).toBe('needs_verification');
  });

  it('normalizes SME and Group without mixing them', () => {
    expect(isolateCreditBook('sme')).toBe('SME');
    expect(isolateCreditBook('AGRI')).toBe('GROUP');
    expect(isolateCreditBook('GROUP')).toBe('GROUP');
    expect(isolateCreditBook('ALL')).toBeUndefined();
  });

  it('treats agri=1 as a subcategory filter, not a book', () => {
    expect(isolateAgriculturalFilter('1')).toBe(true);
    expect(isolateAgriculturalFilter('true')).toBe(true);
    expect(isolateAgriculturalFilter('')).toBe(false);
  });

  it('keeps recent and legacy vintages isolated', () => {
    expect(vintageToLegacyFlag('legacy')).toBe(true);
    expect(vintageToLegacyFlag('recent')).toBe(false);
    expect(vintageToLegacyFlag('all')).toBeUndefined();
  });

  it('builds per-book pagination that does not reuse the other book', () => {
    const sme = buildLoanListQuery({ creditBook: 'SME', vintage: 'legacy', page: 2, size: 20 });
    expect(sme.credit_book).toBe('SME');
    expect(sme.is_legacy).toBe(true);
    expect(sme.skip).toBe(20);
    expect(sme.limit).toBe(20);

    const group = buildLoanListQuery({ creditBook: 'AGRICULTURAL', vintage: 'recent', page: 1 });
    expect(group.credit_book).toBe('GROUP');
    expect(group.is_legacy).toBe(false);
    expect(group.skip).toBe(0);
    expect(sme.credit_book).not.toBe(group.credit_book);
  });

  it('sends is_agricultural as a subcategory on an isolated book', () => {
    const agriSme = buildLoanListQuery({ creditBook: 'SME', isAgricultural: true });
    expect(agriSme.credit_book).toBe('SME');
    expect(agriSme.is_agricultural).toBe(true);
  });

  it('keeps SME/Group on the two work queues and combines them on archive', () => {
    const needs = buildLoanListQuery({
      creditBook: 'SME',
      vintage: 'legacy',
      legacyQueue: 'needs_verification',
    });
    expect(needs.legacy_queue).toBe('needs_verification');
    expect(needs.credit_book).toBe('SME');
    expect(needs.has_balance).toBeUndefined();

    const sent = buildLoanListQuery({
      creditBook: 'GROUP',
      vintage: 'legacy',
      legacyQueue: 'sent_to_accountant',
    });
    expect(sent.legacy_queue).toBe('sent_to_accountant');
    expect(sent.credit_book).toBe('GROUP');
  });

  it('combines SME and Group on the journaled archive queue', () => {
    const archive = buildLoanListQuery({
      creditBook: 'SME',
      isAgricultural: true,
      vintage: 'legacy',
      legacyQueue: 'archive',
    });
    expect(archive.is_legacy).toBe(true);
    expect(archive.legacy_queue).toBe('archive');
    expect(archive.credit_book).toBeUndefined();
    expect(archive.is_agricultural).toBeUndefined();
    expect(archive.has_balance).toBeUndefined();
  });

  it('sends has_balance only when ops picks remaining or MWK 0', () => {
    const zeros = buildLoanListQuery({
      vintage: 'legacy',
      legacyQueue: 'needs_verification',
      hasBalance: false,
    });
    expect(zeros.has_balance).toBe(false);
    const remaining = buildLoanListQuery({
      vintage: 'legacy',
      legacyQueue: 'needs_verification',
      hasBalance: true,
    });
    expect(remaining.has_balance).toBe(true);
    const all = buildLoanListQuery({
      vintage: 'legacy',
      legacyQueue: 'sent_to_accountant',
    });
    expect(all.has_balance).toBeUndefined();
  });

  it('stops pagination at the last isolated page', () => {
    expect(nextLoanListPage(1, 3)).toBe(2);
    expect(nextLoanListPage(3, 3)).toBeNull();
  });
});
