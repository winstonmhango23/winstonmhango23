import { describe, it, expect } from '@jest/globals';

import { payloadHasGroupAllocation } from '@/lib/sync/group-allocation-sync';

describe('payloadHasGroupAllocation', () => {
  it('returns false when group_loan_allocation is missing', () => {
    expect(payloadHasGroupAllocation({})).toBe(false);
  });

  it('returns false when group_loan_allocation is null', () => {
    expect(payloadHasGroupAllocation({ group_loan_allocation: null })).toBe(false);
  });

  it('returns false when group_loan_allocation is not an object', () => {
    expect(payloadHasGroupAllocation({ group_loan_allocation: 'invalid' })).toBe(false);
  });

  it('returns false when group_loan_allocation is an empty object', () => {
    expect(payloadHasGroupAllocation({ group_loan_allocation: {} })).toBe(false);
  });

  it('returns true when group_loan_allocation has member entries', () => {
    expect(
      payloadHasGroupAllocation({
        group_loan_allocation: { '42': { amount_minor: 5000000 } },
      })
    ).toBe(true);
  });
});
