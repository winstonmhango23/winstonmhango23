import { COMPACT_PHONE_MAX_WIDTH } from '@/hooks/use-responsive-layout';

describe('compact client chrome', () => {
  it('treats widths under 400 as compact phones for profile-in-header', () => {
    expect(COMPACT_PHONE_MAX_WIDTH).toBe(400);
    expect(360 < COMPACT_PHONE_MAX_WIDTH).toBe(true);
    expect(414 < COMPACT_PHONE_MAX_WIDTH).toBe(false);
  });
});
