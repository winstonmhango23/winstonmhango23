import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ImageEditModal } from '@/components/image-edit-modal';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { pickKycMedia, type KycMediaVariant, type PickedKycMedia } from '@/lib/media/pick-kyc-media';
import { useAuthenticatedImageUri } from '@/lib/media/authenticated-media';
import { openDocumentViewer } from '@/lib/media/open-document-viewer';
import { persistOfflineMedia } from '@/lib/media/offline-media-store';
import {
  isImagePath,
  isPdfPath,
} from '@/lib/media/resolve-upload-url';
import type { KycUploadField } from '@/lib/client-portal/api';
import { withUserCapture } from '@/lib/sync/user-activity-lock';

type KycDocumentUploadFieldProps = {
  label: string;
  field: KycUploadField;
  token: string;
  serverPath?: string | null;
  localPreviewUri?: string | null;
  variant: KycMediaVariant;
  required?: boolean;
  helperText?: string;
  loading?: boolean;
  onUploaded: (path: string, localUri: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  onLocalPreview?: (uri: string | null) => void;
};

export function KycDocumentUploadField({
  label,
  field,
  token: _token,
  serverPath,
  localPreviewUri,
  variant,
  required,
  helperText,
  loading,
  onUploaded,
  onUploadingChange: _onUploadingChange,
  onLocalPreview,
}: KycDocumentUploadFieldProps) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editUri, setEditUri] = useState<string | null>(null);
  const [pendingPick, setPendingPick] = useState<PickedKycMedia | null>(null);
  /** Keep the last successful local URI so preview stays visible even if parent clears briefly. */
  const [stickyLocalUri, setStickyLocalUri] = useState<string | null>(null);
  const queued = Boolean(serverPath?.startsWith('queued:'));
  const effectiveLocalPreview = localPreviewUri || stickyLocalUri;
  const { uri: authUri, loading: authLoading, error: authError } = useAuthenticatedImageUri(
    queued ? null : serverPath,
    effectiveLocalPreview
  );

  const displayUri = useMemo(() => {
    if (effectiveLocalPreview) return effectiveLocalPreview;
    if (authUri) return authUri;
    return null;
  }, [effectiveLocalPreview, authUri]);

  const hasFile = Boolean(displayUri || serverPath);
  const pathLooksLikePdf =
    !effectiveLocalPreview &&
    (isPdfPath(serverPath) || isPdfPath(displayUri ?? ''));
  // Local picks are always previewable images (PDFs skip the edit flow and use PDF UI).
  const pathLooksLikeImage =
    Boolean(effectiveLocalPreview) ||
    isImagePath(displayUri) ||
    isImagePath(serverPath);
  const showImagePreview =
    Boolean(displayUri) && pathLooksLikeImage && !pathLooksLikePdf;
  const showPdfPreview = !showImagePreview && pathLooksLikePdf;
  const previewBusy =
    loading ||
    (Boolean(serverPath) && !queued && !effectiveLocalPreview && authLoading);
  const showGenericAttached =
    hasFile &&
    !queued &&
    !showImagePreview &&
    !showPdfPreview &&
    !previewBusy &&
    Boolean(serverPath);

  const attachLocal = async (picked: PickedKycMedia, uri: string) => {
    await withUserCapture(async () => {
      const durableUri = await persistOfflineMedia(uri, { name: picked.name });
      setStickyLocalUri(durableUri);
      onLocalPreview?.(durableUri);
      onUploaded(durableUri, durableUri);
    });
  };

  const handlePick = async () => {
    if (loading) return;
    const picked = await pickKycMedia(variant);
    if (!picked) return;

    const isPdf =
      picked.mimeType === 'application/pdf' || isPdfPath(picked.name) || isPdfPath(picked.uri);
    if (!isPdf) {
      setPendingPick(picked);
      setEditUri(picked.uri);
      return;
    }

    await attachLocal(picked, picked.uri);
  };

  const openFullPreview = () => {
    const previewTarget = displayUri || serverPath;
    if (!previewTarget || queued) return;
    if (showPdfPreview || (!showImagePreview && serverPath)) {
      openDocumentViewer(router, {
        uri: previewTarget,
        name: serverPath?.split('/').pop() ?? 'document.pdf',
        docType: field,
      });
      return;
    }
    setPreviewOpen(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <ThemedText style={styles.label}>
          {label}
          {required ? <ThemedText style={styles.required}> *</ThemedText> : null}
        </ThemedText>
        {hasFile ? (
          <ThemedText style={styles.attachedBadge}>Attached</ThemedText>
        ) : required ? (
          <ThemedText style={styles.pendingBadge}>Required</ThemedText>
        ) : (
          <ThemedText style={styles.pendingBadge}>Optional</ThemedText>
        )}
      </View>
      {helperText ? <ThemedText style={styles.helperText}>{helperText}</ThemedText> : null}

      <View style={[styles.card, hasFile && styles.cardFilled]}>
        {previewBusy && !displayUri ? (
          <View style={styles.emptyPreview}>
            <ActivityIndicator color={ClientUI.colors.primary} />
            <ThemedText style={styles.emptyText}>Loading preview…</ThemedText>
          </View>
        ) : queued && effectiveLocalPreview ? (
          <TouchableOpacity
            style={styles.previewTouchable}
            onPress={() => setPreviewOpen(true)}
            activeOpacity={0.85}
          >
            <Image
              source={{ uri: effectiveLocalPreview }}
              style={[styles.previewImage, variant === 'profile' && styles.previewImageRound]}
              contentFit="cover"
              transition={200}
            />
            <View style={styles.previewOverlay}>
              <MaterialIcons name="cloud-queue" size={22} color="#fff" />
              <ThemedText style={styles.previewOverlayText}>Waiting to sync</ThemedText>
            </View>
          </TouchableOpacity>
        ) : showImagePreview && displayUri ? (
          <TouchableOpacity
            style={styles.previewTouchable}
            onPress={openFullPreview}
            activeOpacity={0.85}
            disabled={loading}
          >
            <Image
              source={{ uri: displayUri }}
              style={[styles.previewImage, variant === 'profile' && styles.previewImageRound]}
              contentFit="cover"
              transition={200}
            />
            <View style={styles.previewOverlay}>
              <MaterialIcons name="zoom-in" size={22} color="#fff" />
              <ThemedText style={styles.previewOverlayText}>Tap to view</ThemedText>
            </View>
          </TouchableOpacity>
        ) : showPdfPreview || showGenericAttached ? (
          <TouchableOpacity style={styles.pdfPreview} onPress={openFullPreview} activeOpacity={0.85}>
            <MaterialIcons
              name={showPdfPreview ? 'picture-as-pdf' : 'insert-drive-file'}
              size={40}
              color={ClientUI.colors.primary}
            />
            <ThemedText style={styles.pdfName} numberOfLines={2}>
              {serverPath?.split('/').pop() ?? (showPdfPreview ? 'PDF document' : 'Attached document')}
            </ThemedText>
            <ThemedText style={styles.pdfHint}>
              {authError ? 'Tap to open secure preview' : 'Tap to open'}
            </ThemedText>
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyPreview}>
            <MaterialIcons name="cloud-upload" size={36} color={ClientUI.colors.textMuted} />
            <ThemedText style={styles.emptyText}>No file yet</ThemedText>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnPrimary, loading && styles.actionBtnDisabled]}
            onPress={handlePick}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons
                  name={hasFile ? 'swap-horiz' : 'add-a-photo'}
                  size={18}
                  color="#fff"
                />
                <ThemedText style={styles.actionBtnPrimaryText}>
                  {hasFile ? 'Replace' : variant === 'profile' ? 'Add photo' : 'Upload'}
                </ThemedText>
              </>
            )}
          </Pressable>
          {variant === 'profile' ? (
            <ThemedText style={styles.sourceHint}>Camera or photo library</ThemedText>
          ) : (
            <ThemedText style={styles.sourceHint}>Camera, gallery, or file (PDF/image)</ThemedText>
          )}
        </View>
      </View>

      <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPreviewOpen(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setPreviewOpen(false)} hitSlop={12}>
              <MaterialIcons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            {displayUri ? (
              <Image
                source={{ uri: displayUri }}
                style={styles.modalImage}
                contentFit="contain"
                transition={200}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {editUri && pendingPick ? (
        <ImageEditModal
          visible
          imageUri={editUri}
          onClose={() => {
            setEditUri(null);
            setPendingPick(null);
          }}
          onSave={(uri) => {
            const pick = pendingPick;
            setEditUri(null);
            setPendingPick(null);
            if (pick) void attachLocal(pick, uri);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.text },
  required: { color: ClientUI.colors.danger },
  helperText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginBottom: 8,
    lineHeight: 16,
  },
  attachedBadge: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    color: ClientUI.colors.success,
  },
  pendingBadge: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: ClientUI.colors.textMuted,
  },
  card: {
    borderWidth: 1.5,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: ClientUI.colors.surface,
  },
  cardFilled: {
    borderColor: 'rgba(34,197,94,0.45)',
  },
  previewTouchable: {
    height: 160,
    backgroundColor: '#0f172a',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewImageRound: {
    alignSelf: 'center',
    width: 140,
    height: 140,
    borderRadius: 70,
    marginVertical: 10,
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  previewOverlayText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: '#fff',
  },
  pdfPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 6,
  },
  pdfName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.text,
    textAlign: 'center',
  },
  pdfHint: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: ClientUI.colors.textMuted,
  },
  emptyPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
  },
  actions: {
    padding: 12,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: ClientUI.colors.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnPrimary: {
    backgroundColor: ClientUI.colors.primary,
  },
  actionBtnDisabled: { opacity: 0.7 },
  actionBtnPrimaryText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: '#fff',
  },
  sourceHint: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: ClientUI.colors.textMuted,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 2,
    padding: 8,
  },
  modalImage: {
    width: '92%',
    height: '75%',
  },
});
