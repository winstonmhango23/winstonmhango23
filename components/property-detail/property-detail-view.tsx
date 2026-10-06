import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { DocumentThumbnail } from '@/components/ui/document-thumbnail';
import { LocationCapture } from '@/components/ui/location-capture';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { collateralRequiresGeotag, collateralTypeLabel } from '@/lib/collateral-catalog';
import {
  listCollateralDocuments,
  resolveCollateralGeolocation,
} from '@/lib/collateral-property-utils';
import type { ApiCollateral } from '@/lib/data/api';
import type { GeolocationInput } from '@/lib/data/geolocation-types';
import {
  buildPropertyMapPreviewUrl,
  formatGeolocationSummary,
  openMapsAt,
  openMapsNavigation,
  propertyMapMarkerLabel,
} from '@/lib/maps';
import { openDocumentViewer } from '@/lib/media/open-document-viewer';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  buildNavigationGuide,
  estimateTravelMinutes,
  type LatLng,
} from '@/lib/property-navigation';
import { useRouter } from 'expo-router';

export type PropertyDetailTheme = 'staff' | 'client';

type Props = {
  item: ApiCollateral;
  theme?: PropertyDetailTheme;
  onUpdateLocation?: (location: GeolocationInput) => Promise<void>;
  onRefresh?: () => Promise<void>;
  contentContainerStyle?: ViewStyle;
};

const themeColors = {
  staff: {
    primary: CoFiColors.primary,
    surface: CoFiColors.backgroundCard,
    border: CoFiColors.border,
    canvas: CoFiColors.background,
  },
  client: {
    primary: '#0a3d7a',
    surface: '#ffffff',
    border: '#e2e8f0',
    canvas: '#f8fafc',
  },
};

export function PropertyDetailView({
  item,
  theme = 'staff',
  onUpdateLocation,
  onRefresh,
  contentContainerStyle,
}: Props) {
  const router = useRouter();
  const colors = themeColors[theme];
  const geo = resolveCollateralGeolocation(item);
  const title = collateralTypeLabel(item.collateral_type, item.other_type_label);
  const mapLabel = propertyMapMarkerLabel(item);
  const photos = listCollateralDocuments(item).filter((d) => d.docType === 'COLLATERAL_PHOTO');
  const otherDocs = listCollateralDocuments(item).filter((d) => d.docType !== 'COLLATERAL_PHOTO');
  const needsGeotag = collateralRequiresGeotag(item.collateral_type, item.other_type_label);

  const openDoc = (uri: string | undefined, name: string, docType: string) => {
    if (!uri) return;
    openDocumentViewer(router, { uri, name, docType });
  };

  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [navMode, setNavMode] = useState<'driving' | 'walking'>('driving');
  const [editingLocation, setEditingLocation] = useState(false);
  const [draftLocation, setDraftLocation] = useState<GeolocationInput | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);

  const refreshUserLocation = useCallback(async () => {
    setLocLoading(true);
    setLocError(null);
    try {
      const { getDeviceCoordinates } = await import('@/lib/device-location');
      const coords = await getDeviceCoordinates();
      setUserLocation({ latitude: coords.latitude, longitude: coords.longitude });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not read your location.';
      setLocError(
        msg === 'LOCATION_PERMISSION_DENIED'
          ? 'Enable location to see distance and navigation guidance.'
          : msg
      );
      setUserLocation(null);
    } finally {
      setLocLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!geo) return;
    void refreshUserLocation();
  }, [geo?.latitude, geo?.longitude, refreshUserLocation]);

  useEffect(() => {
    if (!tracking || !geo) return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const { requestForegroundPermissionsAsync, watchPositionAsync } = await import('expo-location');
      const { status } = await requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      sub = await watchPositionAsync({ accuracy: 3, distanceInterval: 8 }, (pos) => {
        setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocError(null);
      });
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [tracking, geo]);

  const navigationGuide = useMemo(() => {
    if (!geo || !userLocation) return null;
    return buildNavigationGuide(userLocation, geo);
  }, [geo, userLocation]);

  // Keep map URL property-only. Including live GPS in the static tile URL
  // reloads the image on every position update and causes visible flicker.
  const mapUrl = useMemo(() => {
    if (!geo) return null;
    return buildPropertyMapPreviewUrl(geo.latitude, geo.longitude, {
      label: mapLabel,
    });
  }, [geo?.latitude, geo?.longitude, mapLabel]);

  const handleSaveLocation = async () => {
    if (!onUpdateLocation || !draftLocation) {
      Alert.alert('Location required', 'Capture GPS coordinates before saving.');
      return;
    }
    setSavingLocation(true);
    try {
      await onUpdateLocation(draftLocation);
      setEditingLocation(false);
      setDraftLocation(null);
      await onRefresh?.();
      Alert.alert('Saved', 'Property location updated.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update location.');
    } finally {
      setSavingLocation(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.canvas }, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ThemedText type="defaultSemiBold" style={styles.heroTitle}>
          {title}
        </ThemedText>
        <ThemedText style={styles.description}>{item.description}</ThemedText>
        <View style={styles.metaRow}>
          <ThemedText style={styles.metaValue}>{formatMinorMWK(item.estimated_value)}</ThemedText>
          {item.registration_number ? (
            <ThemedText style={styles.metaSub}>Reg: {item.registration_number}</ThemedText>
          ) : null}
        </View>
        {item.status ? <ThemedText style={styles.status}>{item.status}</ThemedText> : null}
      </View>

      {geo ? (
        <>
          <Pressable
            style={[styles.mapWrap, { borderColor: colors.border }]}
            onPress={() => openMapsAt(geo.latitude, geo.longitude, mapLabel)}
          >
            {mapUrl ? (
              <Image source={{ uri: mapUrl }} style={styles.mapImage} contentFit="cover" />
            ) : (
              <View style={styles.mapPlaceholder}>
                <MaterialIcons name="map" size={40} color={colors.primary} />
              </View>
            )}
            <View style={styles.mapOverlay}>
              <MaterialIcons name="place" size={16} color="#fff" />
              <ThemedText style={styles.mapOverlayText} numberOfLines={1}>
                {mapLabel}
              </ThemedText>
            </View>
          </Pressable>

          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Location
            </ThemedText>
            <ThemedText style={styles.locationText}>{formatGeolocationSummary(geo)}</ThemedText>
            <ThemedText style={styles.coords}>
              {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)}
              {geo.accuracy_meters != null ? ` · ±${Math.round(geo.accuracy_meters)} m` : ''}
            </ThemedText>
          </View>

          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                Navigation guide
              </ThemedText>
              <Pressable
                style={[styles.trackBtn, tracking && { backgroundColor: colors.primary }]}
                onPress={() => setTracking((v) => !v)}
              >
                <MaterialIcons name="my-location" size={16} color={tracking ? '#fff' : colors.primary} />
                <ThemedText style={[styles.trackBtnText, tracking && { color: '#fff' }]}>
                  {tracking ? 'Live' : 'Track'}
                </ThemedText>
              </Pressable>
            </View>

            {locLoading && !navigationGuide ? (
              <View style={styles.locRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <ThemedText style={styles.locHint}>Getting your position…</ThemedText>
              </View>
            ) : null}

            {locError ? <ThemedText style={styles.locError}>{locError}</ThemedText> : null}

            {navigationGuide ? (
              <View style={styles.guideBox}>
                <View style={styles.compassRow}>
                  <View
                    style={[styles.compassArrow, { transform: [{ rotate: `${navigationGuide.bearing}deg` }] }]}
                  >
                    <MaterialIcons name="navigation" size={36} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.distance}>{navigationGuide.distanceLabel}</ThemedText>
                    <ThemedText style={styles.direction}>
                      {navigationGuide.directionLabel} · {Math.round(navigationGuide.bearing)}°
                    </ThemedText>
                    <ThemedText style={styles.guidance}>{navigationGuide.guidanceText}</ThemedText>
                    <ThemedText style={styles.eta}>
                      Est. {estimateTravelMinutes(navigationGuide.distanceMeters, navMode)} min{' '}
                      {navMode === 'walking' ? 'on foot' : 'by vehicle'}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.modeRow}>
                  {(['driving', 'walking'] as const).map((m) => (
                    <Pressable
                      key={m}
                      style={[styles.modeChip, navMode === m && { backgroundColor: colors.primary }]}
                      onPress={() => setNavMode(m)}
                    >
                      <ThemedText style={[styles.modeChipText, navMode === m && { color: '#fff' }]}>
                        {m === 'driving' ? 'Vehicle' : 'Walking'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                onPress={() =>
                  openMapsNavigation(geo.latitude, geo.longitude, {
                    label: mapLabel,
                    originLat: userLocation?.latitude,
                    originLng: userLocation?.longitude,
                    mode: navMode,
                  })
                }
              >
                <MaterialIcons name="directions" size={20} color="#fff" />
                <ThemedText style={styles.primaryActionText}>Start turn-by-turn navigation</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.secondaryAction, { borderColor: colors.primary }]}
                onPress={() => void refreshUserLocation()}
              >
                <MaterialIcons name="refresh" size={18} color={colors.primary} />
                <ThemedText style={[styles.secondaryActionText, { color: colors.primary }]}>
                  Refresh position
                </ThemedText>
              </Pressable>
            </View>
            <ThemedText style={styles.navFootnote}>
              Red pin marks the property. Distance and direction update from your GPS; turn-by-turn opens your device maps
              app.
            </ThemedText>
          </View>
        </>
      ) : (
        <View style={[styles.section, styles.missingGeo, { borderColor: colors.border }]}>
          <MaterialIcons name="location-off" size={28} color="#b45309" />
          <ThemedText style={styles.missingGeoTitle}>No GPS location recorded</ThemedText>
          <ThemedText style={styles.missingGeoText}>
            {needsGeotag
              ? 'This property must be geotagged before staff can navigate to it.'
              : 'Add a GPS tag to enable map preview and navigation.'}
          </ThemedText>
        </View>
      )}

      {(photos.length > 0 || otherDocs.length > 0) && (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Documents & photos
          </ThemedText>
          {photos.length > 0 ? (
            <View style={styles.thumbGrid}>
              {photos.map((d, i) => {
                const uri = d.url || d.key;
                return (
                  <View key={`${d.docType}-${i}`} style={styles.thumbCell}>
                    <DocumentThumbnail
                      uri={uri}
                      fileName={d.fileName}
                      size={88}
                      onPress={() =>
                        openDoc(uri, d.fileName || `Photo ${i + 1}`, d.docType)
                      }
                    />
                    <ThemedText style={styles.thumbCaption} numberOfLines={1}>
                      {d.fileName || `Photo ${i + 1}`}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          ) : null}
          {otherDocs.map((d, i) => {
            const uri = d.url || d.key;
            return (
              <Pressable
                key={`${d.docType}-${i}`}
                style={styles.docRow}
                onPress={() =>
                  openDoc(uri, d.fileName || d.docType.replace(/_/g, ' '), d.docType)
                }
              >
                <DocumentThumbnail
                  uri={uri}
                  fileName={d.fileName}
                  size={48}
                  showFileLabel
                />
                <ThemedText style={styles.docLine}>
                  {d.docType.replace(/_/g, ' ')}
                  {d.fileName ? ` — ${d.fileName}` : ''}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      {onUpdateLocation ? (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Update property GPS
          </ThemedText>
          {!editingLocation ? (
            <Pressable style={[styles.secondaryAction, { borderColor: colors.primary }]} onPress={() => {
              setDraftLocation(geo);
              setEditingLocation(true);
            }}>
              <MaterialIcons name="edit-location-alt" size={18} color={colors.primary} />
              <ThemedText style={[styles.secondaryActionText, { color: colors.primary }]}>
                {geo ? 'Re-tag location' : 'Tag location'}
              </ThemedText>
            </Pressable>
          ) : (
            <View style={{ gap: 10 }}>
              <LocationCapture
                label="Capture property GPS"
                value={draftLocation}
                onCapture={setDraftLocation}
                disabled={savingLocation}
                showAddressFallback
                showMapLink
                mapLabel={mapLabel}
              />
              <Pressable
                style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                onPress={() => void handleSaveLocation()}
                disabled={savingLocation}
              >
                {savingLocation ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ThemedText style={styles.primaryActionText}>Save location</ThemedText>
                )}
              </Pressable>
              <Pressable onPress={() => setEditingLocation(false)}>
                <ThemedText style={styles.cancelText}>Cancel</ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40, gap: 14, flexGrow: 1 },
  heroCard: {
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    gap: 6,
  },
  heroTitle: { fontSize: 18 },
  description: { fontSize: 14, opacity: 0.75, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  metaValue: { fontSize: 17, fontWeight: '700' },
  metaSub: { fontSize: 12, opacity: 0.55 },
  status: { fontSize: 11, opacity: 0.5, marginTop: 4 },
  mapWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    height: 200,
    backgroundColor: '#e2e8f0',
  },
  mapImage: { width: '100%', height: '100%' },
  mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  mapOverlayText: { color: '#fff', fontSize: 12, fontWeight: '600', flexShrink: 1, maxWidth: 220 },
  section: {
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16 },
  locationText: { fontSize: 14, lineHeight: 20 },
  coords: { fontSize: 12, opacity: 0.6, fontFamily: 'monospace' },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
  },
  trackBtnText: { fontSize: 12, fontWeight: '600', color: CoFiColors.primary },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locHint: { fontSize: 13, opacity: 0.7 },
  locError: { fontSize: 13, color: '#b45309' },
  guideBox: { gap: 12 },
  compassRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  compassArrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  distance: { fontSize: 22, fontWeight: '700' },
  direction: { fontSize: 14, fontWeight: '600', color: CoFiColors.primary, marginTop: 2 },
  guidance: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  eta: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  modeChipText: { fontSize: 12, fontWeight: '600' },
  actionRow: { gap: 10, marginTop: 4 },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.lg,
  },
  primaryActionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  secondaryActionText: { fontWeight: '600', fontSize: 14 },
  navFootnote: { fontSize: 11, opacity: 0.55, lineHeight: 16 },
  missingGeo: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#fffbeb',
  },
  missingGeoTitle: { fontWeight: '700', marginTop: 8, color: '#92400e' },
  missingGeoText: { textAlign: 'center', fontSize: 13, color: '#92400e', marginTop: 4, lineHeight: 18 },
  docLine: { fontSize: 13, opacity: 0.75, flex: 1 },
  thumbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  thumbCell: { width: 88, gap: 4 },
  thumbCaption: { fontSize: 11, opacity: 0.65 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  cancelText: { textAlign: 'center', color: CoFiColors.mutedForeground, marginTop: 4 },
});
