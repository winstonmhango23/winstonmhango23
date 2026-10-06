import {
  defaultTermMonthsForProduct,
  getRequestedAmountMinor,
} from '@/lib/loan-origination/form-api';
import {
  formatMwkFromMinor,
  formatMwkMajorInputDisplayFromMinor,
  normalizeDefaultMwkMajorAmountTyping,
  parseMajorAmountInputToMinor,
  toMinorFromMajor,
} from '@/lib/money/mwk-input';

describe('mwk-input', () => {
  it('formats minor units with MWK prefix and comma grouping', () => {
    expect(formatMwkFromMinor(200_000_000)).toBe('MWK 2,000,000');
    expect(formatMwkMajorInputDisplayFromMinor(200_000_000)).toBe('MWK 2,000,000');
  });

  it('parses major-unit typing into minor units', () => {
    expect(parseMajorAmountInputToMinor('MWK 2,000,000')).toBe(200_000_000);
    expect(parseMajorAmountInputToMinor('2000000')).toBe(200_000_000);
    expect(parseMajorAmountInputToMinor('')).toBe(-1);
  });

  it('normalizes live typing with MWK prefix', () => {
    expect(normalizeDefaultMwkMajorAmountTyping('2000000')).toBe('MWK 2,000,000');
    expect(normalizeDefaultMwkMajorAmountTyping('MWK 1,234')).toBe('MWK 1,234');
  });

  it('converts major to minor consistently', () => {
    expect(toMinorFromMajor(2_000_000)).toBe(200_000_000);
  });
});

describe('form-api money and term defaults', () => {
  it('reads requested amount from minor-unit form values', () => {
    expect(getRequestedAmountMinor({ loan_requested_mwk: 200_000_000 })).toBe(200_000_000);
  });

  it('prefers product maximum term as default', () => {
    expect(
      defaultTermMonthsForProduct({ minimum_term_months: 3, maximum_term_months: 10 })
    ).toBe(10);
    expect(defaultTermMonthsForProduct({ minimum_term_months: 3 })).toBe(3);
  });

  it('validates 2M MWK against 1M–100M product limits in minor units', () => {
    const minor = getRequestedAmountMinor({ loan_requested_mwk: 200_000_000 });
    const min = 100_000_000;
    const max = 10_000_000_000;
    expect(minor).toBeGreaterThanOrEqual(min);
    expect(minor).toBeLessThanOrEqual(max);
    expect(formatMwkFromMinor(min)).toBe('MWK 1,000,000');
  });
});
