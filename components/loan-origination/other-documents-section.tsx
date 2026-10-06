/**
 * Dedicated CTA for officer-named supporting files on the origination draft.
 * Collateral and guarantor keep their own attach flows.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { DocumentThumbnail } from '@/components/ui/document-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { config } from '@/lib/config';
import type { StaffApplicationDocument } from '@/lib/data/api';
import {
  buildOtherDocumentUploadPayload,
  displayNameForApplicationDocument,
  OTHER_DOCUMENT_TITLE_MAX,
} from '@/lib/loan-origination/other-documents';
import { persistOfflineMedia } from '@/lib/media/offline-media-store';
import { withUserCapture } from '@/lib/sync/user-activity-lock';

type PickedOtherFile = {
  uri: string;
  name: string;
  mimeType?: string;
};

export type OtherDocumentUpload = ReturnType<typeof buildOtherDocumentUploadPayload>;

type OtherDocumentsSectionProps = {
  documents: StaffApplicationDocument[];
  canEdit: boolean;
  busy?: boolean;
  highlight?: boolean;
  onOpen: (doc: StaffApplicationDocument) => void;
  onRemove: (doc: StaffApplicationDocument) => void;
  onUpload: (payload: OtherDocumentUpload) => Promise<void>;
  onReplace: (doc: StaffApplicationDocument, payload: OtherDocumentUpload) => Promise<void>;
};

export function OtherDocumentsSection({
  documents,
  canEdit,
  busy = false,
  highlight = false,
  onOpen,
  onRemove,
  onUpload,
  onReplace,
}: OtherDocumentsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<PickedOtherFile | null>(null);
  const [replacing, setReplacing] = useState<StaffApplicationDocument | null>(null);
  const [attaching, setAttaching] = useState(false);

  const resetForm = () => {
    setShowForm(false);
    setTitle('');
    setPicked(null);
    setReplacing(null);
  };

  const persistPicked = async (uri: string, name: string, mimeType?: string) => {
    setAttaching(true);
    try {
      const durableUri = await persistOfflineMedia(uri, { name });
      setPicked({ uri: durableUri, name, mimeType });
    } finally {
      setAttaching(false);
    }
  };

  const pickFile = async () => {
    try {
      await withUserCapture(async () => {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'image/*'],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        const name = asset.name ?? 'document';
        if (!title.trim()) {
          const withoutExt = name.replace(/\.[a-zA-Z0-9]+$/, '');
          if (withoutExt) setTitle(withoutExt);
        }
        await persistPicked(asset.uri, name, asset.mimeType ?? undefined);
      });
    } catch {
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Could not pick a file. Please try again.');
      }
    }
  };

  const capturePhoto = async () => {
    try {
      await withUserCapture(async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to capture a document photo.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.9,
        });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        const name = asset.fileName ?? `capture-${Date.now()}.jpg`;
        await persistPicked(asset.uri, name, asset.mimeType ?? 'image/jpeg');
      });
    } catch {
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Could not capture a photo. Please try again.');
      }
    }
  };

  const submit = async () => {
    try {
      const payload = buildOtherDocumentUploadPayload({
        title,
        uri: picked?.uri ?? '',
        fileName: picked?.name ?? '',
        mimeType: picked?.mimeType,
      });
      if (replacing) {
        await onReplace(replacing, payload);
      } else {
        await onUpload(payload);
      }
      resetForm();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save this document.';
      const validation = /name for this document|PDF or image/i.test(message);
      Alert.alert(validation ? 'Required' : 'Upload failed', message);
    }
  };

  return (
    <View style={[styles.section, highlight && styles.sectionHighlight]}>
      <View style={styles.header}>
        <MaterialIcons
          name="attach-file"
          size={22}
          color={highlight ? CoFiColors.primary : CoFiColors.mutedForeground}
        />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.title}>
            Other documents{documents.length > 0 ? ` (${documents.length})` : ''}
          </ThemedText>
          <ThemedText style={styles.hint}>
            {canEdit
              ? highlight
                ? 'This product needs at least one other supporting document. Give each file a name, then attach a PDF or photo.'
                : 'Custom supporting files that are not collateral or guarantor attachments — e.g. a chief letter, survey sketch, or extra ID photo.'
              : 'Custom supporting documents attached by the loan officer.'}
          </ThemedText>
        </View>
      </View>

      {documents.map((doc) => {
        const label = displayNameForApplicationDocument(doc);
        const authApiUrl = config.staff.loanDocumentFile(doc.id);
        return (
          <View key={doc.id} style={styles.documentRow}>
            <TouchableOpacity
              style={styles.documentMain}
              onPress={() => onOpen(doc)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${label}`}
            >
              <DocumentThumbnail
                serverPath={authApiUrl}
                fileName={doc.file_name || label}
                mimeType={doc.mime_type}
                size={48}
                showFileLabel
                onPress={() => onOpen(doc)}
              />
              <View style={{ flex: 1 }}>
                <ThemedText type="defaultSemiBold">{label}</ThemedText>
                <ThemedText style={styles.meta}>
                  Custom document
                  {doc.uploaded_at ? ` · ${(doc.uploaded_at || '').slice(0, 10)}` : ''}
                </ThemedText>
              </View>
            </TouchableOpacity>
            {canEdit ? (
              <View style={styles.rowActions}>
                <TouchableOpacity
                  onPress={() => {
                    setReplacing(doc);
                    setTitle(displayNameForApplicationDocument(doc));
                    setPicked(null);
                    setShowForm(true);
                  }}
                  hitSlop={8}
                  accessibilityLabel={`Replace ${label}`}
                >
                  <MaterialIcons name="swap-horiz" size={22} color={CoFiColors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onRemove(doc)}
                  hitSlop={8}
                  disabled={busy}
                  accessibilityLabel={`Remove ${label}`}
                >
                  <MaterialIcons name="delete-outline" size={22} color="#b91c1c" />
                </TouchableOpacity>
              </View>
            ) : (
              <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
            )}
          </View>
        );
      })}

      {canEdit && showForm ? (
        <View style={styles.form}>
          {replacing ? (
            <ThemedText style={styles.meta}>Replacing “{displayNameForApplicationDocument(replacing)}”</ThemedText>
          ) : null}
          <ThemedText style={styles.fieldLabel}>Document name *</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="e.g. Marriage certificate, land survey"
            placeholderTextColor="#9ca3af"
            value={title}
            onChangeText={setTitle}
            maxLength={OTHER_DOCUMENT_TITLE_MAX}
          />
          <View style={styles.pickRow}>
            <TouchableOpacity style={styles.pickBtn} onPress={() => void pickFile()} disabled={attaching}>
              <MaterialIcons name="folder-open" size={20} color={CoFiColors.primary} />
              <ThemedText style={styles.pickBtnText}>Pick PDF or image</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickBtn} onPress={() => void capturePhoto()} disabled={attaching}>
              <MaterialIcons name="camera-alt" size={20} color={CoFiColors.primary} />
              <ThemedText style={styles.pickBtnText}>Capture</ThemedText>
            </TouchableOpacity>
          </View>
          {attaching ? (
            <ActivityIndicator color={CoFiColors.primary} />
          ) : picked ? (
            <ThemedText style={styles.pickedName}>{picked.name}</ThemedText>
          ) : null}
          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
              <ThemedText>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={() => void submit()} disabled={busy || attaching}>
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.saveBtnText}>{replacing ? 'Replace' : 'Upload'}</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : canEdit ? (
        <TouchableOpacity
          style={highlight ? styles.ctaPrimary : styles.cta}
          onPress={() => {
            setReplacing(null);
            setTitle('');
            setPicked(null);
            setShowForm(true);
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={documents.length > 0 ? 'Add another document' : 'Add other document'}
        >
          <MaterialIcons
            name="note-add"
            size={20}
            color={highlight ? '#fff' : CoFiColors.primary}
          />
          <ThemedText style={highlight ? styles.ctaPrimaryText : styles.ctaText}>
            {documents.length > 0 ? 'Add another document' : 'Add other document'}
          </ThemedText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    backgroundColor: 'rgba(0,0,0,0.02)',
    gap: 10,
  },
  sectionHighlight: {
    borderColor: CoFiColors.primary,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  hint: { fontSize: 12, lineHeight: 17, opacity: 0.75 },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CoFiColors.border,
  },
  documentMain: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  rowActions: { flexDirection: 'row', gap: 4 },
  meta: { fontSize: 12, opacity: 0.65 },
  form: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  pickRow: { flexDirection: 'row', gap: 8 },
  pickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    borderRadius: Radius.md,
    backgroundColor: '#fff',
  },
  pickBtnText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 13 },
  pickedName: { fontSize: 13, fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.lg,
  },
  saveBtn: {
    flex: 1,
    padding: 14,
    backgroundColor: CoFiColors.primary,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: CoFiColors.primary,
    borderRadius: Radius.lg,
    backgroundColor: '#fff',
  },
  ctaText: { color: CoFiColors.primary, fontWeight: '700', fontSize: 15 },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    backgroundColor: CoFiColors.primary,
  },
  ctaPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
