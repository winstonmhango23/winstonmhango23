import {
  collateralOptionsForContext,
  collateralRequiresGeotag,
  collateralRequiresPropertyPhotos,
  defaultCollateralType,
  normalizeAcceptedCollateralTypes,
  validateCollateralPropertyCapture,
} from '@/lib/collateral-catalog';
import type { GeolocationInput } from '@/lib/data/geolocation-types';

describe('collateral property geotagging', () => {
  const geo: GeolocationInput = { latitude: -13.96, longitude: 33.77 };
  const withPhoto = [{ uri: 'file://a.jpg', name: 'a.jpg', docType: 'COLLATERAL_PHOTO' as const }];
  const withoutPhoto = [{ uri: 'file://b.pdf', name: 'b.pdf', docType: 'COLLATERAL_TITLE' as const }];

  it('requires geotag for real estate and buildings', () => {
    expect(collateralRequiresGeotag('REAL_ESTATE')).toBe(true);
    expect(collateralRequiresGeotag('BUILDING')).toBe(true);
    expect(collateralRequiresGeotag('VEHICLE')).toBe(false);
  });

  it('requires geotag for OTHER when label mentions land or shop', () => {
    expect(collateralRequiresGeotag('OTHER', 'Residential land plot')).toBe(true);
    expect(collateralRequiresGeotag('OTHER', 'Liquor shop')).toBe(true);
    expect(collateralRequiresGeotag('OTHER', 'Motorcycle')).toBe(false);
  });

  it('requires property photos when geotag is required', () => {
    expect(collateralRequiresPropertyPhotos('BUILDING')).toBe(true);
    expect(collateralRequiresPropertyPhotos('VEHICLE')).toBe(false);
  });

  it('validates missing GPS for property collateral', () => {
    expect(
      validateCollateralPropertyCapture({
        collateralType: 'REAL_ESTATE',
        geolocation: null,
        documents: withPhoto,
      })
    ).toMatch(/GPS location is required/);
  });

  it('validates missing photos for property collateral', () => {
    expect(
      validateCollateralPropertyCapture({
        collateralType: 'BUILDING',
        geolocation: geo,
        documents: withoutPhoto,
      })
    ).toMatch(/property photo/);
  });

  it('passes when GPS and photo are present', () => {
    expect(
      validateCollateralPropertyCapture({
        collateralType: 'REAL_ESTATE',
        geolocation: geo,
        documents: withPhoto,
      })
    ).toBeNull();
  });
});

describe('product-accepted collateral filtering', () => {
  it('normalizes accepted types to uppercase', () => {
    expect(normalizeAcceptedCollateralTypes(['real_estate', ' Vehicle '])).toEqual([
      'REAL_ESTATE',
      'VEHICLE',
    ]);
    expect(normalizeAcceptedCollateralTypes([])).toBeNull();
    expect(normalizeAcceptedCollateralTypes(null)).toBeNull();
  });

  it('excludes types not accepted by the loan product', () => {
    const opts = collateralOptionsForContext({
      isAgricultural: false,
      isGroupBorrower: false,
      acceptedCollateralTypes: ['REAL_ESTATE', 'VEHICLE', 'CHATTELS', 'GUARANTEE'],
    });
    const values = opts.map((o) => o.value);
    expect(values).toEqual(['REAL_ESTATE', 'VEHICLE', 'GUARANTEE', 'CHATTELS']);
    expect(values).not.toContain('BUILDING');
    expect(values).not.toContain('EQUIPMENT');
  });

  it('keeps full catalog when product does not restrict types', () => {
    const opts = collateralOptionsForContext({
      isAgricultural: false,
      isGroupBorrower: false,
      acceptedCollateralTypes: null,
    });
    expect(opts.map((o) => o.value)).toContain('BUILDING');
    expect(opts.map((o) => o.value)).toContain('REAL_ESTATE');
  });

  it('defaults selection to the first accepted option', () => {
    const opts = collateralOptionsForContext({
      isAgricultural: false,
      isGroupBorrower: false,
      acceptedCollateralTypes: ['CHATTELS', 'VEHICLE'],
    });
    // BASE_OPTIONS order: VEHICLE before CHATTELS
    expect(defaultCollateralType(opts)).toBe('VEHICLE');
  });
});
