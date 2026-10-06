import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { DocumentThumbnail } from '@/components/ui/document-thumbnail';
import { LocationCapture } from '@/components/ui/location-capture';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import {
  collateralRequiresGeotag,
  collateralTypeLabel,
} from '@/lib/collateral-catalog';
import {
  countCollateralPhotos,
  listCollateralDocuments,
  resolveCollateralGeolocation,
} from '@/lib/collateral-property-utils';
import type { ApiCollateral } from '@/lib/data/api';
import type { GeolocationInput } from '@/lib/data/geolocation-types';
import { formatGeolocationSummary, openMapsAt, propertyMapMarkerLabel } from '@/lib/maps';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

type Props = {
  item: ApiCollateral;
  onUpdateLocation?: (location: GeolocationInput) => Promise<void>;
  showValue?: boolean;
  compact?: boolean;
  /** Deep link to full property detail + navigation screen */
  detailHref?: string;
};

export function CollateralPropertyCard({
  item,
  onUpdateLocation,
  showValue = true,
  compact = false,
  detailHref,
}: Props) {
  const router = useRouter();
  const [editingLocation, setEditingLocation] = useState(false);
  const [draftLocation, setDraftLocation] = useState<GeolocationInput | null>(null);
  const [saving, setSaving] = useState(false);

  const geo = resolveCollateralGeolocation(item);
  const needsGeotag = collateralRequiresGeotag(item.collateral_type, item.other_type_label);
  const photoCount = countCollateralPhotos(item);
  const firstPhoto = listCollateralDocuments(item).find((d) => d.docType === 'COLLATERAL_PHOTO');
  const firstPhotoUri = firstPhoto?.url || firstPhoto?.key;
  const title = collateralTypeLabel(item.collateral_type, item.other_type_label);
  const mapLabel = propertyMapMarkerLabel(item);

  const openDetail = () => {
    if (detailHref) router.push(detailHref as Href);
  };

  const handleSaveLocation = async () => {
    if (!onUpdateLocation || !draftLocation) {
      Alert.alert('Location required', 'Capture GPS coordinates before saving.');
      return;
    }
    setSaving(true);
    try {
      await onUpdateLocation(draftLocation);
      setEditingLocation(false);
      setDraftLocation(null);
      Alert.alert('Saved', 'Property location updated.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Pressable
      style={[styles.card, compact && styles.cardCompact]}
      onPress={detailHref ? openDetail : undefined}
      disabled={!detailHref}
    >
      <View style={styles.headerRow}>
        {firstPhotoUri ? (
          <DocumentThumbnail
            uri={firstPhotoUri}
            fileName={firstPhoto?.fileName}
            size={56}
            onPress={detailHref ? openDetail : undefined}
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText style={styles.description}>{item.description}</ThemedText>
          {item.registration_number ? (
            <ThemedText style={styles.meta}>Reg: {item.registration_number}</ThemedText>
          ) : null}
        </View>
        {showValue ? (
          <ThemedText style={styles.amount}>{formatMinorMWK(item.estimated_value)}</ThemedText>
        ) : null}
      </View>

      {needsGeotag ? (
        <View style={styles.propertySection}>
          {geo ? (
            <View style={styles.geoRow}>
              <MaterialIcons name="place" size={18} color={CoFiColors.success} />
              <ThemedText style={styles.geoText}>{formatGeolocationSummary(geo)}</ThemedText>
            </View>
          ) : (
            <View style={styles.warningRow}>
              <MaterialIcons name="location-off" size={18} color="#b45309" />
              <ThemedText style={styles.warningText}>Property not geotagged yet</ThemedText>
            </View>
          )}

          {photoCount > 0 ? (
            <ThemedText style={styles.meta}>{photoCount} property photo{photoCount === 1 ? '' : 's'} on file</ThemedText>
          ) : needsGeotag ? (
            <ThemedText style={styles.warningText}>No property photos on file</ThemedText>
          ) : null}

          <View style={styles.actionRow}>
            {detailHref ? (
              <Pressable style={[styles.actionBtn, styles.detailBtn]} onPress={openDetail}>
                <MaterialIcons name="explore" size={16} color={CoFiColors.primary} />
                <ThemedText style={styles.actionBtnText}>Details & navigation</ThemedText>
              </Pressable>
            ) : null}
            {geo ? (
              <Pressable
                style={styles.actionBtn}
                onPress={() => openMapsAt(geo.latitude, geo.longitude, mapLabel)}
              >
                <MaterialIcons name="map" size={16} color={CoFiColors.primary} />
                <ThemedText style={styles.actionBtnText}>Open in maps</ThemedText>
              </Pressable>
            ) : null}
            {onUpdateLocation ? (
              <Pressable
                style={styles.actionBtn}
                onPress={() => {
                  setDraftLocation(geo);
                  setEditingLocation((v) => !v);
                }}
              >
                <MaterialIcons name="my-location" size={16} color={CoFiColors.primary} />
                <ThemedText style={styles.actionBtnText}>
                  {geo ? 'Update location' : 'Tag location'}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          {editingLocation && onUpdateLocation ? (
            <View style={styles.editSection}>
              <LocationCapture
                label="Capture property GPS"
                value={draftLocation}
                onCapture={setDraftLocation}
                disabled={saving}
                showAddressFallback
                showMapLink
                mapLabel={mapLabel}
              />
              <Pressable style={styles.saveBtn} onPress={() => void handleSaveLocation()} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ThemedText style={styles.saveBtnText}>Save location</ThemedText>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : geo ? (
        <View style={styles.actionRow}>
          {detailHref ? (
            <Pressable style={[styles.actionBtn, styles.detailBtn]} onPress={openDetail}>
              <MaterialIcons name="explore" size={16} color={CoFiColors.primary} />
              <ThemedText style={styles.actionBtnText}>Details & navigation</ThemedText>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.actionBtn}
            onPress={() => openMapsAt(geo.latitude, geo.longitude, mapLabel)}
          >
            <MaterialIcons name="map" size={16} color={CoFiColors.primary} />
            <ThemedText style={styles.actionBtnText}>Open tagged location</ThemedText>
          </Pressable>
        </View>
      ) : detailHref ? (
        <Pressable style={[styles.actionBtn, styles.detailBtn]} onPress={openDetail}>
          <MaterialIcons name="explore" size={16} color={CoFiColors.primary} />
          <ThemedText style={styles.actionBtnText}>View property details</ThemedText>
        </Pressable>
      ) : null}

      {item.status ? <ThemedText style={styles.status}>{item.status}</ThemedText> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    gap: 8,
  },
  cardCompact: { marginBottom: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 15 },
  description: { fontSize: 13, opacity: 0.7, marginTop: 2 },
  meta: { fontSize: 12, opacity: 0.55, marginTop: 2 },
  amount: { fontWeight: '700', fontSize: 15 },
  propertySection: { gap: 6, marginTop: 4 },
  geoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  geoText: { flex: 1, fontSize: 13, color: CoFiColors.foreground },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warningText: { fontSize: 12, color: '#b45309' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  detailBtn: { backgroundColor: '#ecfdf5', borderColor: '#86efac' },
  actionBtnText: { fontSize: 12, color: CoFiColors.primary, fontWeight: '600' },
  editSection: { marginTop: 8, gap: 8 },
  saveBtn: {
    backgroundColor: CoFiColors.primary,
    paddingVertical: 10,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  status: { fontSize: 11, opacity: 0.5 },
});
