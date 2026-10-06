import React from 'react';
import { Marker } from 'react-native-maps';

import { CoFiColors } from '@/constants/theme';
import type { ApiPropertyMapPoint } from '@/lib/data/api';
import { propertyMapMarkerLabel } from '@/lib/maps';

type Props = {
  point: ApiPropertyMapPoint;
  selected: boolean;
  onPress: (point: ApiPropertyMapPoint) => void;
};

/**
 * Default pin markers only — custom Marker children have crashed native MapView
 * on New Architecture / some Android Google Maps builds.
 */
export function PropertyMapMarker({ point, selected, onPress }: Props) {
  const label = propertyMapMarkerLabel(point);
  const lat = Number(point.latitude);
  const lng = Number(point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      title={label}
      description={point.client_name ?? undefined}
      pinColor={selected ? CoFiColors.primaryDark : CoFiColors.primary}
      onPress={() => onPress(point)}
      tracksViewChanges={false}
      accessibilityLabel={`${label}${point.client_name ? ` — ${point.client_name}` : ''}`}
    />
  );
}
