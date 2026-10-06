import {
  buildMemberCashCollateralListing,
  defaultDescriptionForCollateralType,
  memberCashCollateralMinor,
  parseGroupAllocationLines,
} from '@/lib/group-member-cash-collateral';

describe('group member cash collateral (15% rule)', () => {
  it('calculates 15% of member loan share', () => {
    expect(memberCashCollateralMinor(100_000_00)).toBe(15_000_00);
    expect(memberCashCollateralMinor(0)).toBe(0);
  });

  it('parses custom allocation lines', () => {
    const lines = parseGroupAllocationLines({
      mode: 'custom',
      member_client_ids: [1, 2],
      lines: [
        { member_client_id: 1, amount_minor: 200_000_00 },
        { member_client_id: 2, amount_minor: 100_000_00 },
      ],
    });
    expect(lines).toEqual([
      { member_client_id: 1, amount_minor: 200_000_00 },
      { member_client_id: 2, amount_minor: 100_000_00 },
    ]);
  });

  it('expands equal mode from facility total', () => {
    const lines = parseGroupAllocationLines(
      { mode: 'equal', member_client_ids: [10, 11] },
      { totalAmountMinor: 300_000_00, memberIds: [10, 11] }
    );
    expect(lines).toEqual([
      { member_client_id: 10, amount_minor: 150_000_00 },
      { member_client_id: 11, amount_minor: 150_000_00 },
    ]);
  });

  it('builds listing with total cash collateral', () => {
    const { lines, totalCashMinor } = buildMemberCashCollateralListing({
      allocation: {
        mode: 'custom',
        lines: [
          { member_client_id: 1, amount_minor: 200_000_00 },
          { member_client_id: 2, amount_minor: 100_000_00 },
        ],
      },
      selectedMemberIds: [1, 2],
      memberNameById: { 1: 'Ada', 2: 'Ben' },
    });
    expect(lines[0]).toMatchObject({
      member_name: 'Ada',
      loan_share_minor: 200_000_00,
      cash_collateral_minor: 30_000_00,
    });
    expect(lines[1].cash_collateral_minor).toBe(15_000_00);
    expect(totalCashMinor).toBe(45_000_00);
  });

  it('defaults descriptions by type', () => {
    expect(defaultDescriptionForCollateralType('MEMBER_CASH_COLLATERAL_PCT')).toContain('15%');
    expect(defaultDescriptionForCollateralType('GROUP_MUTUAL_GUARANTEE')).toContain('mutual');
    expect(defaultDescriptionForCollateralType('REAL_ESTATE')).toBe('');
  });
});
