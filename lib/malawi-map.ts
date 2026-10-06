import type { Region } from 'react-native-maps';

import type { ApiPropertyMapPoint } from '@/lib/data/api';
import type { PropertyDetailSource } from '@/lib/property-detail-routing';

/** Country-level view centered on Malawi (WGS84). */
export const MALAWI_REGION: Region = {
  latitude: -13.2543,
  longitude: 34.3015,
  latitudeDelta: 7.2,
  longitudeDelta: 5.4,
};

export function propertyMapPointSource(point: ApiPropertyMapPoint): PropertyDetailSource | null {
  switch (point.source_kind) {
    case 'loan':
      if (point.loan_id == null || !Number.isFinite(point.loan_id)) return null;
      return { kind: 'loan', loanId: point.loan_id };
    case 'application':
      if (point.application_id == null || !Number.isFinite(point.application_id)) return null;
      return { kind: 'application', applicationId: point.application_id };
    case 'vault':
    default:
      if (point.client_id == null || !Number.isFinite(point.client_id)) return null;
      return { kind: 'vault', clientId: point.client_id };
  }
}

export function coordinatesForPoints(
  points: Pick<ApiPropertyMapPoint, 'latitude' | 'longitude'>[]
): { latitude: number; longitude: number }[] {
  return points
    .map((p) => ({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
    }))
    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
}

/** Drop pins with non-finite coords before rendering native Markers. */
export function sanitizePropertyMapPoints(points: ApiPropertyMapPoint[]): ApiPropertyMapPoint[] {
  return points.filter((p) => {
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    );
  });
}
