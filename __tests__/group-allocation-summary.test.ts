import { describe, it, expect } from '@jest/globals';

import {
  hasDisplayableAllocation,
  memberPhotoPath,
  resolveAllocationMemberIds,
} from '@/lib/loan-origination/group-allocation-display';

describe('group allocation display guard', () => {
  it('rejects empty allocation object', () => {
    expect(hasDisplayableAllocation({})).toBe(false);
  });

  it('accepts equal mode member ids', () => {
    expect(hasDisplayableAllocation({ mode: 'equal', member_client_ids: [1, 2] })).toBe(true);
  });

  it('accepts custom lines', () => {
    expect(
      hasDisplayableAllocation({
        mode: 'custom',
        lines: [{ member_client_id: 3, amount_minor: 500000 }],
      })
    ).toBe(true);
  });

  it('accepts legacy keyed allocation map', () => {
    expect(hasDisplayableAllocation({ '10': { amount_minor: 250000 } })).toBe(true);
  });
});

describe('memberPhotoPath', () => {
  it('prefers the ID photo and falls back to the profile photo', () => {
    expect(
      memberPhotoPath({
        idPhotoPath: '/uploads/kyc/id.jpg',
        profilePhotoPath: '/uploads/kyc/face.jpg',
      })
    ).toBe('/uploads/kyc/id.jpg');
    expect(memberPhotoPath({ profilePhotoPath: '/uploads/kyc/face.jpg' })).toBe(
      '/uploads/kyc/face.jpg'
    );
    expect(memberPhotoPath({})).toBeNull();
    expect(memberPhotoPath({ idPhotoPath: '   ' })).toBeNull();
  });
});

describe('resolveAllocationMemberIds', () => {
  it('uses fallback member ids when allocation is empty', () => {
    expect(resolveAllocationMemberIds(null, [11, 12])).toEqual([11, 12]);
    expect(resolveAllocationMemberIds({}, [11])).toEqual([11]);
  });

  it('prefers allocation member ids over fallback', () => {
    expect(
      resolveAllocationMemberIds({ mode: 'equal', member_client_ids: [4, 5] }, [11])
    ).toEqual([4, 5]);
  });
});
