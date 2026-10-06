import { useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ErrorBoundary } from '@/components/error-boundary';
import { PropertiesMapCanvas, type PropertiesMapCanvasHandle } from '@/components/properties-map/properties-map-canvas';
import { PropertyMapBottomCard } from '@/components/properties-map/property-map-bottom-card';
import { PropertyMapToolbar } from '@/components/properties-map/property-map-toolbar';
import { StaffScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { apiListPropertyMapPoints, type ApiPropertyMapPoint } from '@/lib/data/api';
import { getDeviceCoordinates } from '@/lib/device-location';
import { openMapsAt, openMapsNavigation, propertyMapMarkerLabel } from '@/lib/maps';
import {
  propertyMapPointSource,
  sanitizePropertyMapPoints,
} from '@/lib/malawi-map';
import { propertyDetailHref } from '@/lib/property-detail-routing';
import { getStoredAuth } from '@/lib/storage';

export default function StaffPropertiesMapScreen() {
  const router = useRouter();
  const mapRef = useRef<PropertiesMapCanvasHandle>(null);
  const [points, setPoints] = useState<ApiPropertyMapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [directionsBusy, setDirectionsBusy] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  // List-first: native MapView has hard-crashed some Android/New Arch builds.
  // Users opt into the map after the screen is stable.
  const [listMode, setListMode] = useState(true);

  const safePoints = useMemo(() => sanitizePropertyMapPoints(points), [points]);

  const loadPoints = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        setError('Sign in again to load property locations.');
        setPoints([]);
        return;
      }
      const rows = await apiListPropertyMapPoints(auth.token, {
        q: search?.trim() || undefined,
      });
      const sanitized = sanitizePropertyMapPoints(rows);
      setPoints(sanitized);
      if (!listMode && !mapFailed && sanitized.length > 0) {
        requestAnimationFrame(() => mapRef.current?.fitMarkers(sanitized));
      } else if (!listMode && !mapFailed) {
        mapRef.current?.fitMalawi();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load property map.');
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [listMode, mapFailed]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setMapReady(true);
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    const delay = query.trim() ? 350 : 0;
    const t = setTimeout(() => {
      void loadPoints(query);
    }, delay);
    return () => clearTimeout(t);
  }, [query, loadPoints]);

  const selected = useMemo(
    () => safePoints.find((p) => p.collateral_id === selectedId) ?? null,
    [safePoints, selectedId]
  );

  const onSelect = useCallback((point: ApiPropertyMapPoint) => {
    setSelectedId(point.collateral_id);
    if (!listMode && !mapFailed) {
      mapRef.current?.animateTo(Number(point.latitude), Number(point.longitude), 0.04);
    }
  }, [listMode, mapFailed]);

  const ensureViewerLocation = useCallback(async () => {
    setLocating(true);
    try {
      const coords = await getDeviceCoordinates();
      const loc = { latitude: coords.latitude, longitude: coords.longitude };
      setUserLocation(loc);
      return loc;
    } finally {
      setLocating(false);
    }
  }, []);

  const onRecenterMe = useCallback(async () => {
    try {
      const loc = await ensureViewerLocation();
      mapRef.current?.animateTo(loc.latitude, loc.longitude, 0.06);
    } catch (e) {
      Alert.alert(
        'Location unavailable',
        e instanceof Error ? e.message : 'Could not read your current location.'
      );
    }
  }, [ensureViewerLocation]);

  const onDirections = useCallback(async () => {
    if (!selected) return;
    setDirectionsBusy(true);
    try {
      let origin = userLocation;
      if (!origin) {
        origin = await ensureViewerLocation();
      }
      openMapsNavigation(Number(selected.latitude), Number(selected.longitude), {
        label: propertyMapMarkerLabel(selected),
        originLat: origin.latitude,
        originLng: origin.longitude,
        mode: 'driving',
      });
    } catch (e) {
      Alert.alert(
        'Directions unavailable',
        e instanceof Error
          ? e.message
          : 'Enable location services to navigate from your position.'
      );
    } finally {
      setDirectionsBusy(false);
    }
  }, [ensureViewerLocation, selected, userLocation]);

  const onOpenProperty = useCallback(() => {
    if (!selected) return;
    const source = propertyMapPointSource(selected);
    if (!source) {
      Alert.alert('Unavailable', 'This property is missing client or loan linkage.');
      return;
    }
    router.push(propertyDetailHref(selected.collateral_id, source, 'staff') as Href);
  }, [router, selected]);

  const showMap = mapReady && !mapFailed && !listMode;

  return (
    <View style={styles.root}>
      <StaffScreen
        noPadding
        header={{
          title: 'Properties map',
          subtitle: 'Collateral locations across Malawi',
          showBack: true,
          onBack: () => router.back(),
        }}
      >
        <View style={styles.mapArea}>
          {showMap ? (
            <ErrorBoundary
              onError={() => {
                setMapFailed(true);
                setListMode(true);
              }}
              fallback={
                <View style={styles.mapFallback}>
                  <ThemedText style={styles.emptyTitle}>Map view unavailable</ThemedText>
                  <ThemedText style={styles.emptyBody}>
                    Showing the property list instead. You can open any pin in the device maps app.
                  </ThemedText>
                </View>
              }
            >
              <PropertiesMapCanvas
                ref={mapRef}
                points={safePoints}
                selectedId={selectedId}
                onSelect={onSelect}
                userLocation={userLocation}
              />
            </ErrorBoundary>
          ) : (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              {(mapFailed || listMode) && (
                <View style={styles.listBanner}>
                  <MaterialIcons name="map" size={18} color={CoFiColors.primary} />
                  <ThemedText style={styles.listBannerText}>
                    {mapFailed
                      ? 'Native map failed to load — using list view. Open a property in device maps for navigation.'
                      : 'List view of geotagged collateral properties.'}
                  </ThemedText>
                </View>
              )}
              {safePoints.map((point) => (
                <Pressable
                  key={point.collateral_id}
                  style={[
                    styles.listRow,
                    selectedId === point.collateral_id && styles.listRowSelected,
                  ]}
                  onPress={() => onSelect(point)}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.listTitle} numberOfLines={1}>
                      {propertyMapMarkerLabel(point)}
                    </ThemedText>
                    <ThemedText style={styles.listSub} numberOfLines={1}>
                      {point.client_name ?? 'Unknown client'}
                      {point.branch_name ? ` · ${point.branch_name}` : ''}
                    </ThemedText>
                  </View>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      openMapsAt(
                        Number(point.latitude),
                        Number(point.longitude),
                        propertyMapMarkerLabel(point)
                      )
                    }
                  >
                    <MaterialIcons name="directions" size={22} color={CoFiColors.primary} />
                  </Pressable>
                </Pressable>
              ))}
              {!loading && safePoints.length === 0 ? (
                <ThemedText style={styles.emptyBody}>
                  No geotagged properties yet. Tag REAL ESTATE / BUILDING collateral with GPS to see them here.
                </ThemedText>
              ) : null}
            </ScrollView>
          )}

          <PropertyMapToolbar
            query={query}
            onQueryChange={setQuery}
            count={safePoints.length}
            loading={loading}
            onFitMalawi={() => {
              if (showMap) mapRef.current?.fitMalawi();
              else setListMode(false);
            }}
            onFitMarkers={() => {
              if (showMap) mapRef.current?.fitMarkers(safePoints);
              else setListMode(false);
            }}
            onRecenterMe={() => void onRecenterMe()}
            locating={locating}
          />

          <Pressable
            style={styles.modeToggle}
            onPress={() => {
              if (listMode || mapFailed) {
                // Opt into native map (retry after a prior failure).
                setMapReady(false);
                setMapFailed(false);
                setListMode(false);
                InteractionManager.runAfterInteractions(() => {
                  setMapReady(true);
                });
                return;
              }
              setListMode(true);
            }}
          >
            <MaterialIcons
              name={listMode || mapFailed ? 'map' : 'list'}
              size={16}
              color="#fff"
            />
            <ThemedText style={styles.modeToggleText}>
              {listMode || mapFailed ? 'Try map' : 'List view'}
            </ThemedText>
          </Pressable>

          {error ? (
            <View style={styles.errorBanner}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          {!loading && !error && safePoints.length === 0 && showMap ? (
            <View style={styles.emptyBanner}>
              <ThemedText style={styles.emptyTitle}>No geotagged properties yet</ThemedText>
              <ThemedText style={styles.emptyBody}>
                When clients or officers tag REAL ESTATE / BUILDING collateral GPS, pins appear here.
              </ThemedText>
            </View>
          ) : null}

          {selected ? (
            <PropertyMapBottomCard
              point={selected}
              onClose={() => setSelectedId(null)}
              onOpenProperty={onOpenProperty}
              onDirections={() => void onDirections()}
              directionsBusy={directionsBusy}
            />
          ) : null}
        </View>
      </StaffScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CoFiColors.background },
  mapArea: { flex: 1 },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#dbe4ef',
  },
  listScroll: { flex: 1, backgroundColor: CoFiColors.background },
  listContent: { padding: 12, paddingTop: 72, paddingBottom: 120, gap: 8 },
  listBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(10,61,122,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
  },
  listBannerText: { flex: 1, fontSize: 12, color: CoFiColors.foreground, lineHeight: 17 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    backgroundColor: CoFiColors.backgroundCard,
  },
  listRowSelected: { borderColor: CoFiColors.primary, backgroundColor: 'rgba(10,61,122,0.06)' },
  listTitle: { fontSize: 14, fontWeight: '700', color: CoFiColors.foreground },
  listSub: { fontSize: 12, color: CoFiColors.mutedForeground, marginTop: 2 },
  modeToggle: {
    position: 'absolute',
    right: 12,
    top: 118,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoFiColors.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeToggleText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  errorBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    backgroundColor: 'rgba(127, 29, 29, 0.92)',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  emptyBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: CoFiColors.foreground,
  },
  emptyBody: {
    marginTop: 4,
    fontSize: 12,
    color: CoFiColors.mutedForeground,
    lineHeight: 17,
  },
});
