export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres between two WGS84 points. */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `from` to `to` in degrees (0 = north, clockwise). */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => ((rad * 180) / Math.PI + 360) % 360;
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return toDeg(Math.atan2(y, x));
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function cardinalDirection(bearing: number): string {
  const idx = Math.round(bearing / 45) % 8;
  return CARDINALS[idx];
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export type NavigationGuide = {
  distanceMeters: number;
  distanceLabel: string;
  bearing: number;
  directionLabel: string;
  guidanceText: string;
};

export function buildNavigationGuide(from: LatLng, to: LatLng): NavigationGuide {
  const distanceMeters = haversineDistanceMeters(from, to);
  const bearing = bearingDegrees(from, to);
  const directionLabel = cardinalDirection(bearing);
  const distanceLabel = formatDistance(distanceMeters);
  const guidanceText =
    distanceMeters < 25
      ? 'You are at or very close to the property.'
      : `Head ${directionLabel} — property is about ${distanceLabel} away.`;
  return { distanceMeters, distanceLabel, bearing, directionLabel, guidanceText };
}

/** Rough ETA assuming average travel speed (metres per minute). */
export function estimateTravelMinutes(distanceMeters: number, mode: 'walking' | 'driving' = 'driving'): number {
  const speedMpm = mode === 'walking' ? 80 : 500;
  return Math.max(1, Math.round(distanceMeters / speedMpm));
}
