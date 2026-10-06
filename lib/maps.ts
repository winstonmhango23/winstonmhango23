import { Linking, Platform } from 'react-native';

import { collateralTypeLabel } from '@/lib/collateral-catalog';

export function formatGeolocationSummary(geo: {
  latitude: number;
  longitude: number;
  address?: string | null;
  city?: string | null;
}): string {
  const lat = Number(geo.latitude);
  const lng = Number(geo.longitude);
  const coords =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      : 'Location unavailable';
  const parts = [geo.address?.trim(), geo.city?.trim()].filter(Boolean);
  if (parts.length > 0) return `${parts.join(', ')} (${coords})`;
  return coords;
}

/** Pin title for maps: property description, else OTHER label, else collateral type. */
export function propertyMapMarkerLabel(item: {
  description?: string | null;
  collateral_type?: string | null;
  other_type_label?: string | null;
}): string {
  const desc = item.description?.trim();
  if (desc) return desc;
  const other = item.other_type_label?.trim();
  if (other) return other;
  if (item.collateral_type) return collateralTypeLabel(item.collateral_type, item.other_type_label);
  return 'Property';
}

/** Open the device maps app at a GPS coordinate (Google Maps on web). */
export function openMapsAt(latitude: number, longitude: number, label?: string): void {
  const lat = latitude.toFixed(6);
  const lng = longitude.toFixed(6);
  const title = label?.trim();
  const encodedLabel = title ? encodeURIComponent(title) : undefined;

  let url: string;
  if (Platform.OS === 'ios') {
    // Apple Maps: q= shows as the pin title; ll= centers the map.
    url = encodedLabel
      ? `http://maps.apple.com/?ll=${lat},${lng}&q=${encodedLabel}`
      : `http://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`;
  } else if (Platform.OS === 'android') {
    // geo: query with (Label) sets the marker title in Google Maps / default maps apps.
    url = encodedLabel
      ? `geo:0,0?q=${lat},${lng}(${encodedLabel})`
      : `geo:${lat},${lng}?q=${lat},${lng}`;
  } else {
    url = encodedLabel
      ? `https://www.google.com/maps?q=${encodedLabel}@${lat},${lng}`
      : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  }

  void Linking.openURL(url).catch(() => {
    void Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`);
  });
}

export type MapsNavigationMode = 'driving' | 'walking';

/** Launch turn-by-turn navigation to a destination (uses device maps app). */
export function openMapsNavigation(
  destLat: number,
  destLng: number,
  options?: {
    label?: string;
    originLat?: number;
    originLng?: number;
    mode?: MapsNavigationMode;
  }
): void {
  const mode = options?.mode ?? 'driving';
  const dest = `${destLat},${destLng}`;
  const hasOrigin =
    options?.originLat != null &&
    options?.originLng != null &&
    Number.isFinite(options.originLat) &&
    Number.isFinite(options.originLng);
  const label = options?.label?.trim();

  let url: string;
  if (Platform.OS === 'ios') {
    const daddr = label
      ? `${dest}(${encodeURIComponent(label)})`
      : dest;
    url = hasOrigin
      ? `http://maps.apple.com/?saddr=${options!.originLat},${options!.originLng}&daddr=${daddr}&dirflg=${mode === 'walking' ? 'w' : 'd'}`
      : `http://maps.apple.com/?daddr=${daddr}&dirflg=${mode === 'walking' ? 'w' : 'd'}`;
  } else if (Platform.OS === 'android') {
    // Prefer labeled destination when possible; fall back to google.navigation.
    if (label) {
      url = `google.navigation:q=${destLat},${destLng}(${encodeURIComponent(label)})&mode=${mode === 'walking' ? 'w' : 'd'}`;
    } else {
      url = `google.navigation:q=${destLat},${destLng}&mode=${mode === 'walking' ? 'w' : 'd'}`;
    }
  } else {
    const travelmode = mode === 'walking' ? 'walking' : 'driving';
    const origin = hasOrigin ? `&origin=${options!.originLat},${options!.originLng}` : '';
    const destQuery = label
      ? encodeURIComponent(`${label}@${dest}`)
      : dest;
    url = `https://www.google.com/maps/dir/?api=1&destination=${destQuery}${origin}&travelmode=${travelmode}`;
  }

  void Linking.openURL(url).catch(() => {
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode === 'walking' ? 'walking' : 'driving'}`
    );
  });
}

/** Static OpenStreetMap preview (no API key). Marker labels are shown in-app overlay (API has no title). */
export function buildPropertyMapPreviewUrl(
  latitude: number,
  longitude: number,
  options?: {
    width?: number;
    height?: number;
    zoom?: number;
    userLat?: number;
    userLng?: number;
    /** Reserved for callers; static OSM tiles cannot render text labels. */
    label?: string;
  }
): string {
  const width = options?.width ?? 640;
  const height = options?.height ?? 280;
  const zoom = options?.zoom ?? 16;
  const params = new URLSearchParams({
    center: `${latitude},${longitude}`,
    zoom: String(zoom),
    size: `${width}x${height}`,
    markers: `${latitude},${longitude},red`,
  });
  if (
    options?.userLat != null &&
    options?.userLng != null &&
    Number.isFinite(options.userLat) &&
    Number.isFinite(options.userLng)
  ) {
    params.append('markers', `${options.userLat},${options.userLng},blue`);
  }
  return `https://staticmap.openstreetmap.de/staticmap.php?${params.toString()}`;
}
