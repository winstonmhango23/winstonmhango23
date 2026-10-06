import {
  bearingDegrees,
  buildNavigationGuide,
  cardinalDirection,
  formatDistance,
  haversineDistanceMeters,
  estimateTravelMinutes,
} from '@/lib/property-navigation';
import { buildPropertyMapPreviewUrl, propertyMapMarkerLabel } from '@/lib/maps';

describe('property navigation', () => {
  const property = { latitude: -13.9626, longitude: 33.7741 };
  const nearby = { latitude: -13.96, longitude: 33.77 };

  it('computes haversine distance', () => {
    const d = haversineDistanceMeters(nearby, property);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(2000);
  });

  it('formats distance labels', () => {
    expect(formatDistance(450)).toBe('450 m');
    expect(formatDistance(2400)).toBe('2.4 km');
  });

  it('resolves cardinal direction from bearing', () => {
    expect(cardinalDirection(0)).toBe('N');
    expect(cardinalDirection(90)).toBe('E');
  });

  it('builds navigation guidance text', () => {
    const guide = buildNavigationGuide(nearby, property);
    expect(guide.distanceLabel).toMatch(/m|km/);
    expect(guide.directionLabel.length).toBeGreaterThan(0);
    expect(guide.guidanceText).toContain('Head');
  });

  it('estimates travel minutes', () => {
    expect(estimateTravelMinutes(500, 'walking')).toBeGreaterThanOrEqual(1);
    expect(estimateTravelMinutes(5000, 'driving')).toBeGreaterThanOrEqual(1);
  });

  it('builds static map preview URL', () => {
    const url = buildPropertyMapPreviewUrl(property.latitude, property.longitude, {
      userLat: nearby.latitude,
      userLng: nearby.longitude,
      label: 'Lilongwe plot',
    });
    expect(url).toContain('staticmap.openstreetmap.de');
    expect(url).toContain('markers');
  });

  it('prefers description for map marker labels', () => {
    expect(
      propertyMapMarkerLabel({
        description: 'House on Chileka Road',
        collateral_type: 'REAL_ESTATE',
        other_type_label: null,
      })
    ).toBe('House on Chileka Road');
    expect(
      propertyMapMarkerLabel({
        description: '  ',
        collateral_type: 'OTHER',
        other_type_label: 'Shop fittings',
      })
    ).toBe('Shop fittings');
  });

  it('bearing is stable for same points', () => {
    const b = bearingDegrees(nearby, property);
    expect(Number.isFinite(b)).toBe(true);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});
