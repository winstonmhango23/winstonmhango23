/**
 * DocumentUploadField – Professional document upload for loan applications.
 * Supports PDF and images with inline thumbnails after pick/capture.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { DocumentThumbnail } from '@/components/ui/document-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { persistOfflineMedia } from '@/lib/media/offline-media-store';
import { isPdfPath } from '@/lib/media/resolve-upload-url';
import { withUserCapture } from '@/lib/sync/user-activity-lock';

export type DocType =
  | 'LOAN_APPLICATION'
  | 'NATIONAL_ID'
  | 'INCOME_PROOF'
  | 'BANK_STATEMENT'
  | 'COLLATERAL_TITLE'
  | 'COLLATERAL_PHOTO'
  | 'GUARANTOR_ID'
  | 'INSURANCE_POLICY'
  | 'CONTRACT'
  | 'OTHER';

export interface PickedDocument {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
  docType: DocType;
}

const DOC_TYPE_LABELS: Record<DocType, string> = {
  LOAN_APPLICATION: 'Loan Application Form',
  NATIONAL_ID: 'National ID',
  INCOME_PROOF: 'Income Proof',
  BANK_STATEMENT: 'Bank Statement',
  COLLATERAL_TITLE: 'Collateral Title',
  COLLATERAL_PHOTO: 'Property Photo',
  GUARANTOR_ID: 'Guarantor ID',
  INSURANCE_POLICY: 'Insurance Policy',
  CONTRACT: 'Contract',
  OTHER: 'Other Document',
};

interface DocumentUploadFieldProps {
  docType: DocType;
  label?: string;
  required?: boolean;
  documents: PickedDocument[];
  onDocumentsChange: (docs: PickedDocument[]) => void;
  disabled?: boolean;
  maxFiles?: number;
  /** When true, show "Capture photo" option for camera capture (e.g. collateral title deeds) */
  allowCapture?: boolean;
}

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

function isImageDoc(d: PickedDocument): boolean {
  if (d.mimeType?.startsWith('image/')) return true;
  if (d.mimeType === 'application/pdf' || isPdfPath(d.name) || isPdfPath(d.uri)) return false;
  return /\.(jpe?g|png|gif|webp)$/i.test(d.name) || d.uri.startsWith('file://');
}

export function DocumentUploadField({
  docType,
  label,
  required,
  documents,
  onDocumentsChange,
  disabled,
  maxFiles = 3,
  allowCapture = false,
}: DocumentUploadFieldProps) {
  const [attaching, setAttaching] = React.useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const typeDocs = documents.filter((d) => d.docType === docType);
  const displayLabel = label ?? DOC_TYPE_LABELS[docType];
  const busy = disabled || attaching || typeDocs.length >= maxFiles;

  const addDoc = (newDoc: PickedDocument) => {
    const existing = documents.filter((d) => d.docType !== docType);
    const typeDocsNew = [...typeDocs, newDoc].slice(0, maxFiles);
    onDocumentsChange([...existing, ...typeDocsNew]);
  };

  // Documents stay queued on the device until the application syncs, so the
  // bytes must be copied out of the OS cache before they can be purged.
  const normalizePickedImage = async (uri: string, name: string, mimeType?: string) => {
    // Persist a durable copy only. Compression happens at Save/sync so capture stays snappy.
    return { uri: await persistOfflineMedia(uri, { name }), name, mimeType };
  };

  const handlePick = async () => {
    if (busy) return;
    try {
      await withUserCapture(async () => {
        const result = await DocumentPicker.getDocumentAsync({
          type: ACCEPTED_TYPES,
          copyToCacheDirectory: true,
        });

        if (result.canceled) return;

        const asset = result.assets[0];
        setAttaching(true);
        try {
          const normalized = await normalizePickedImage(
            asset.uri,
            asset.name ?? 'Document',
            asset.mimeType
          );
          addDoc({
            uri: normalized.uri,
            name: normalized.name,
            size: asset.size,
            mimeType: normalized.mimeType,
            docType,
          });
        } finally {
          setAttaching(false);
        }
      });
    } catch {
      setAttaching(false);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Could not pick document. Please try again.');
      }
    }
  };

  const handleCapture = async () => {
    if (busy) return;
    try {
      await withUserCapture(async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to capture documents.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.9,
        });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        const captureName = asset.fileName ?? `capture-${Date.now()}.jpg`;
        setAttaching(true);
        try {
          addDoc({
            uri: await persistOfflineMedia(asset.uri, { name: captureName }),
            name: captureName,
            size: asset.fileSize,
            mimeType: 'image/jpeg',
            docType,
          });
        } finally {
          setAttaching(false);
        }
      });
    } catch {
      setAttaching(false);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Could not capture photo. Please try again.');
      }
    }
  };

  const removeDoc = (uri: string) => {
    onDocumentsChange(documents.filter((d) => d.uri !== uri));
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <ThemedText style={styles.label}>
          {displayLabel}
          {required && <ThemedText style={styles.required}> *</ThemedText>}
        </ThemedText>
        {required && typeDocs.length === 0 && (
          <ThemedText style={styles.hint}>Required</ThemedText>
        )}
      </View>

      {allowCapture ? (
        <View
          style={[
            styles.uploadZone,
            typeDocs.length > 0 && styles.uploadZoneFilled,
            busy && styles.uploadZoneDisabled,
          ]}
        >
          {attaching ? (
            <ActivityIndicator size="small" color={CoFiColors.primary} />
          ) : (
            <>
              <MaterialIcons
                name={typeDocs.length > 0 ? 'check-circle' : 'cloud-upload'}
                size={32}
                color={typeDocs.length > 0 ? CoFiColors.success : CoFiColors.mutedForeground}
              />
              <ThemedText
                style={[styles.uploadText, typeDocs.length > 0 && styles.uploadTextSuccess]}
              >
                {typeDocs.length > 0
                  ? `${typeDocs.length} file(s) attached`
                  : 'Pick or capture document'}
              </ThemedText>
              <ThemedText style={styles.uploadHint}>
                PDF, JPG, PNG • Max {maxFiles} file(s)
              </ThemedText>
              <View style={styles.captureRow}>
                <TouchableOpacity
                  style={styles.captureBtn}
                  onPress={handlePick}
                  disabled={busy}
                >
                  <MaterialIcons name="folder-open" size={20} color={CoFiColors.primary} />
                  <ThemedText style={styles.captureBtnText}>Pick file</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.captureBtn}
                  onPress={handleCapture}
                  disabled={busy}
                >
                  <MaterialIcons name="camera-alt" size={20} color={CoFiColors.primary} />
                  <ThemedText style={styles.captureBtnText}>Capture</ThemedText>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.uploadZone,
            busy && styles.uploadZoneDisabled,
            typeDocs.length > 0 && styles.uploadZoneFilled,
          ]}
          onPress={handlePick}
          disabled={busy}
          activeOpacity={0.7}
        >
          {attaching ? (
            <ActivityIndicator size="small" color={CoFiColors.primary} />
          ) : (
            <>
              <MaterialIcons
                name={typeDocs.length > 0 ? 'check-circle' : 'cloud-upload'}
                size={32}
                color={typeDocs.length > 0 ? CoFiColors.success : CoFiColors.mutedForeground}
              />
              <ThemedText
                style={[styles.uploadText, typeDocs.length > 0 && styles.uploadTextSuccess]}
              >
                {typeDocs.length > 0
                  ? `${typeDocs.length} file(s) attached`
                  : 'Tap to upload PDF or image'}
              </ThemedText>
              <ThemedText style={styles.uploadHint}>
                PDF, JPG, PNG • Max {maxFiles} file(s)
              </ThemedText>
            </>
          )}
        </TouchableOpacity>
      )}

      {typeDocs.length > 0 && (
        <View style={styles.fileList}>
          {typeDocs.map((d) => (
            <View key={d.uri} style={styles.fileRow}>
              <DocumentThumbnail
                localUri={d.uri}
                fileName={d.name}
                mimeType={d.mimeType}
                size={52}
                showFileLabel
                onPress={
                  isImageDoc(d)
                    ? () => setPreviewUri(d.uri)
                    : undefined
                }
              />
              <View style={styles.fileMeta}>
                <ThemedText style={styles.fileName} numberOfLines={2}>
                  {d.name}
                </ThemedText>
                <ThemedText style={styles.fileHint}>
                  {isImageDoc(d) ? 'Tap thumbnail to preview' : 'PDF attached'}
                </ThemedText>
              </View>
              {!disabled && (
                <TouchableOpacity
                  onPress={() => removeDoc(d.uri)}
                  hitSlop={12}
                  style={styles.removeBtn}
                >
                  <MaterialIcons name="close" size={18} color={CoFiColors.destructive} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPreviewUri(null)}>
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.modalImage} contentFit="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', opacity: 0.9 },
  required: { color: CoFiColors.destructive },
  hint: { fontSize: 12, color: CoFiColors.mutedForeground, marginLeft: 8 },
  uploadZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: CoFiColors.border,
    borderRadius: Radius.lg,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  uploadZoneFilled: {
    borderColor: CoFiColors.success,
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
  },
  uploadZoneDisabled: { opacity: 0.6 },
  uploadText: { marginTop: 8, fontSize: 14, opacity: 0.8 },
  uploadTextSuccess: { color: CoFiColors.success, fontWeight: '600' },
  uploadHint: { marginTop: 4, fontSize: 12, opacity: 0.6 },
  fileList: { marginTop: 12, gap: 8 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: CoFiColors.muted,
    borderRadius: Radius.md,
    gap: 12,
  },
  fileMeta: { flex: 1, gap: 2 },
  fileName: { fontSize: 14, fontWeight: '600' },
  fileHint: { fontSize: 11, color: CoFiColors.mutedForeground },
  removeBtn: { padding: 4 },
  captureRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  captureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    borderRadius: Radius.md,
  },
  captureBtnText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalImage: { width: '100%', height: '80%' },
});
