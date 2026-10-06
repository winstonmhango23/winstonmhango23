import { parseManualCoordinates } from '@/lib/device-location';

describe('parseManualCoordinates', () => {
  it('parses separate lat/lng', () => {
    expect(parseManualCoordinates('-13.9626', '33.7741')).toEqual({
      latitude: -13.9626,
      longitude: 33.7741,
    });
  });

  it('parses comma-separated pair in the lat field', () => {
    expect(parseManualCoordinates('-13.96, 33.77', '')).toEqual({
      latitude: -13.96,
      longitude: 33.77,
    });
  });

  it('rejects out-of-range values', () => {
    expect(parseManualCoordinates('91', '0')).toBeNull();
    expect(parseManualCoordinates('0', '181')).toBeNull();
  });

  it('rejects empty / non-numeric input', () => {
    expect(parseManualCoordinates('', '')).toBeNull();
    expect(parseManualCoordinates('abc', 'def')).toBeNull();
  });
});
