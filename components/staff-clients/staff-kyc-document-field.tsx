import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ImageEditModal } from '@/components/image-edit-modal';
import { CoFiColors, Fonts, Radius } from '@/constants/theme';
import type { KycUploadField } from '@/lib/client-portal/api';
import { useAuthenticatedImageUri } from '@/lib/media/authenticated-media';
import { openDocumentViewer } from '@/lib/media/open-document-viewer';
import { pickKycMedia, type KycMediaVariant } from '@/lib/media/pick-kyc-media';
import { persistOfflineMedia } from '@/lib/media/offline-media-store';
import { isImagePath, isPdfPath } from '@/lib/media/resolve-upload-url';
import { withUserCapture } from '@/lib/sync/user-activity-lock';

type StaffKycDocumentFieldProps = {
  label: string;
  field: KycUploadField;
  serverPath?: string | null;
  localPreviewUri?: string | null;
  variant: KycMediaVariant;
  onLocalPick: (uri: string) => void;
  onClear?: () => void;
};

export function StaffKycDocumentField({
  label,
  serverPath,
  localPreviewUri,
  variant,
  onLocalPick,
  onClear,
}: StaffKycDocumentFieldProps) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editUri, setEditUri] = useState<string | null>(null);
  const { uri: authUri, loading: authLoading } = useAuthenticatedImageUri(
    serverPath?.startsWith('queued:') ? null : serverPath,
    localPreviewUri
  );

  const displayUri = useMemo(() => localPreviewUri ?? authUri ?? null, [localPreviewUri, authUri]);
  const hasFile = Boolean(displayUri || serverPath);
  const pathLooksLikePdf =
    !localPreviewUri && (isPdfPath(serverPath) || isPdfPath(displayUri ?? ''));
  // Prefer showing a thumbnail whenever a local image URI is available.
  const pathLooksLikeImage =
    Boolean(localPreviewUri) || isImagePath(displayUri) || isImagePath(serverPath);
  const showImagePreview = Boolean(displayUri) && pathLooksLikeImage && !pathLooksLikePdf;
  const previewBusy = Boolean(serverPath) && !localPreviewUri && authLoading;

  const handlePick = async () => {
    const picked = await pickKycMedia(variant);
    if (!picked) return;
    const isPdf =
      picked.mimeType === 'application/pdf' || isPdfPath(picked.name) || isPdfPath(picked.uri);
    if (!isPdf) {
      setEditUri(picked.uri);
      return;
    }
    onLocalPick(picked.uri);
  };

  const openPreview = () => {
    if (!displayUri && !serverPath) return;
    if (showImagePreview && displayUri) {
      setPreviewOpen(true);
      return;
    }
    openDocumentViewer(router, {
      uri: displayUri ?? serverPath ?? '',
      name: label,
      docType: pathLooksLikePdf ? 'pdf' : 'image',
    });
  };

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={styles.row}>
        <TouchableOpacity style={styles.previewBox} onPress={openPreview} activeOpacity={0.85}>
          {previewBusy ? (
            <ActivityIndicator color={CoFiColors.primary} />
          ) : showImagePreview && displayUri ? (
            <Image source={{ uri: displayUri }} style={styles.previewImage} contentFit="cover" />
          ) : hasFile ? (
            <View style={styles.filePlaceholder}>
              <MaterialIcons
                name={pathLooksLikePdf ? 'picture-as-pdf' : 'insert-drive-file'}
                size={28}
                color={CoFiColors.primary}
              />
              <ThemedText style={styles.fileText}>Attached</ThemedText>
            </View>
          ) : (
            <View style={styles.empty}>
              <MaterialIcons name="add-a-photo" size={28} color="#9ca3af" />
              <ThemedText style={styles.emptyText}>No file</ThemedText>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={handlePick}>
            <MaterialIcons name="photo-camera" size={20} color={CoFiColors.primary} />
            <ThemedText style={styles.actionText}>Add</ThemedText>
          </Pressable>
          {hasFile && onClear ? (
            <Pressable
              style={styles.actionBtn}
              onPress={() => {
                Alert.alert('Remove document', 'Remove this attachment?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: onClear },
                ]);
              }}
            >
              <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
              <ThemedText style={[styles.actionText, { color: '#ef4444' }]}>Remove</ThemedText>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPreviewOpen(false)}>
          {displayUri ? (
            <Image source={{ uri: displayUri }} style={styles.modalImage} contentFit="contain" />
          ) : null}
        </Pressable>
      </Modal>

      {editUri ? (
        <ImageEditModal
          visible
          imageUri={editUri}
          onClose={() => setEditUri(null)}
          onSave={(uri) => {
            setEditUri(null);
            void withUserCapture(async () => {
              onLocalPick(await persistOfflineMedia(uri));
            });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', opacity: 0.85 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  previewBox: {
    width: 88,
    height: 88,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: CoFiColors.backgroundCard,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },
  filePlaceholder: { alignItems: 'center', gap: 4 },
  fileText: { fontFamily: Fonts.sans, fontSize: 11, color: CoFiColors.primary },
  empty: { alignItems: 'center', gap: 4 },
  emptyText: { fontFamily: Fonts.sans, fontSize: 11, color: '#9ca3af' },
  actions: { gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  actionText: { fontFamily: Fonts.sans, fontSize: 13, color: CoFiColors.primary },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalImage: { width: '100%', height: '80%' },
});
