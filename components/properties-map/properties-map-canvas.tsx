import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { PropertyMapMarker } from '@/components/properties-map/property-map-marker';
import type { ApiPropertyMapPoint } from '@/lib/data/api';
import { MALAWI_REGION, coordinatesForPoints, sanitizePropertyMapPoints } from '@/lib/malawi-map';

export type PropertiesMapCanvasHandle = {
  fitMalawi: () => void;
  fitMarkers: (points: ApiPropertyMapPoint[]) => void;
  animateTo: (latitude: number, longitude: number, delta?: number) => void;
};

type Props = {
  points: ApiPropertyMapPoint[];
  selectedId: number | null;
  onSelect: (point: ApiPropertyMapPoint) => void;
  userLocation?: { latitude: number; longitude: number } | null;
};

export const PropertiesMapCanvas = forwardRef<PropertiesMapCanvasHandle, Props>(
  function PropertiesMapCanvas({ points, selectedId, onSelect, userLocation }, ref) {
    const mapRef = useRef<MapView>(null);
    const safePoints = useMemo(() => sanitizePropertyMapPoints(points), [points]);

    useImperativeHandle(ref, () => ({
      fitMalawi: () => {
        mapRef.current?.animateToRegion(MALAWI_REGION, 450);
      },
      fitMarkers: (list) => {
        const coords = coordinatesForPoints(list);
        if (coords.length === 0) {
          mapRef.current?.animateToRegion(MALAWI_REGION, 450);
          return;
        }
        if (coords.length === 1) {
          mapRef.current?.animateToRegion(
            {
              ...coords[0],
              latitudeDelta: 0.08,
              longitudeDelta: 0.08,
            },
            450
          );
          return;
        }
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 120, right: 48, bottom: 200, left: 48 },
          animated: true,
        });
      },
      animateTo: (latitude, longitude, delta = 0.05) => {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        const region: Region = {
          latitude,
          longitude,
          latitudeDelta: delta,
          longitudeDelta: delta,
        };
        mapRef.current?.animateToRegion(region, 450);
      },
    }));

    return (
      <View style={styles.root} collapsable={false}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          initialRegion={MALAWI_REGION}
          showsUserLocation={Boolean(userLocation)}
          showsMyLocationButton={false}
          showsCompass
          rotateEnabled={false}
          pitchEnabled={false}
          zoomEnabled
          scrollEnabled
          mapType="standard"
          loadingEnabled
          moveOnMarkerPress={false}
        >
          {safePoints.map((point) => (
            <PropertyMapMarker
              key={point.collateral_id}
              point={point}
              selected={selectedId === point.collateral_id}
              onPress={onSelect}
            />
          ))}
        </MapView>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#dbe4ef',
    minHeight: 240,
  },
});
