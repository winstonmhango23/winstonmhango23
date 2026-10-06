import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { DocumentUploadField, type PickedDocument } from '@/components/ui/document-upload-field';
import { LocationCapture } from '@/components/ui/location-capture';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  collateralRequiresGeotag,
  collateralRequiresPropertyPhotos,
  collateralShowsPropertyCapture,
} from '@/lib/collateral-catalog';
import type { GeolocationInput } from '@/lib/data/geolocation-types';

type Props = {
  collateralType: string;
  /** When adding multiple types at once, pass all selected types for validation UI. */
  collateralTypes?: string[];
  otherTypeLabel?: string;
  location: GeolocationInput | null;
  onLocationChange: (location: GeolocationInput) => void;
  documents: PickedDocument[];
  onDocumentsChange: (docs: PickedDocument[]) => void;
  disabled?: boolean;
};

export function CollateralPropertyCaptureFields({
  collateralType,
  collateralTypes,
  otherTypeLabel,
  location,
  onLocationChange,
  documents,
  onDocumentsChange,
  disabled = false,
}: Props) {
  const types = collateralTypes?.length ? collateralTypes : [collateralType];
  const showCapture = useMemo(
    () => types.some((t) => collateralShowsPropertyCapture(t, otherTypeLabel)),
    [types, otherTypeLabel]
  );
  const requiresGeotag = useMemo(
    () => types.some((t) => collateralRequiresGeotag(t, otherTypeLabel)),
    [types, otherTypeLabel]
  );
  const requiresPhotos = useMemo(
    () => types.some((t) => collateralRequiresPropertyPhotos(t, otherTypeLabel)),
    [types, otherTypeLabel]
  );

  if (!showCapture) return null;

  return (
    <View style={styles.wrap}>
      {requiresGeotag ? (
        <View style={styles.notice}>
          <ThemedText style={styles.noticeText}>
            Real-estate collateral must be geotagged so any loan officer can locate this property after
            reassignment or rotation.
          </ThemedText>
        </View>
      ) : null}

      <LocationCapture
        label={requiresGeotag ? 'Property GPS location *' : 'Property location (optional)'}
        value={location}
        onCapture={onLocationChange}
        disabled={disabled}
        showAddressFallback
        showMapLink
      />

      <DocumentUploadField
        docType="COLLATERAL_PHOTO"
        label={
          requiresPhotos
            ? 'Property photos * (camera or file)'
            : 'Property photos (camera or file)'
        }
        required={requiresPhotos}
        documents={documents}
        onDocumentsChange={onDocumentsChange}
        disabled={disabled}
        maxFiles={6}
        allowCapture
      />

      <DocumentUploadField
        docType="COLLATERAL_TITLE"
        label="Title deed / valuation / legal documents"
        documents={documents}
        onDocumentsChange={onDocumentsChange}
        disabled={disabled}
        maxFiles={5}
        allowCapture
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  notice: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 4,
  },
  noticeText: {
    fontSize: 13,
    color: CoFiColors.foreground,
    lineHeight: 18,
  },
});
