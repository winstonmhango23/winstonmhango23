import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';

import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { DocumentThumbnail } from '@/components/ui/document-thumbnail';
import { CoFiColors, Radius } from '@/constants/theme';
import {
  PROFILE_DOC_TYPES,
  labelForProfileDocType,
  type CustomerPortalDocumentType,
} from '@/lib/client-portal/loan-document-types';
import { getClient, getClientDocuments, addClientDocument, deleteClientDocument } from '@/lib/data';
import type { ApiClientDocument } from '@/lib/data';
import { config } from '@/lib/config';
import { openDocumentViewer } from '@/lib/media/open-document-viewer';
import { isImagePath } from '@/lib/media/resolve-upload-url';
import { staffClientKycHref } from '@/lib/staff/client-file-links';
import { goToStaffClientParent } from '@/lib/staff/staff-parent-navigation';

type DocListItem = {
  key: string;
  title: string;
  subtitle: string;
  uri: string;
  source: 'kyc' | 'record';
  recordId?: number;
  docType: string;
};

function guessMime(fileName: string | null | undefined): string {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function kycDocsFromClient(client: Awaited<ReturnType<typeof getClient>>): DocListItem[] {
  if (!client) return [];
  const docs: DocListItem[] = [];
  if (client.photo_uri) {
    docs.push({
      key: 'kyc-photo',
      title: 'Profile photo',
      subtitle: 'KYC · Profile',
      uri: client.photo_uri,
      source: 'kyc',
      docType: 'PROFILE_PHOTO',
    });
  }
  if (client.id_document_uri) {
    docs.push({
      key: 'kyc-id-front',
      title: 'ID document (front)',
      subtitle: 'KYC · Identity',
      uri: client.id_document_uri,
      source: 'kyc',
      docType: 'ID_FRONT',
    });
  }
  if (client.id_document_back_uri) {
    docs.push({
      key: 'kyc-id-back',
      title: 'ID document (back)',
      subtitle: 'KYC · Identity',
      uri: client.id_document_back_uri,
      source: 'kyc',
      docType: 'ID_BACK',
    });
  }
  if (client.group_constitution_uri) {
    docs.push({
      key: 'kyc-constitution',
      title: 'Group constitution',
      subtitle: 'KYC · Group',
      uri: client.group_constitution_uri,
      source: 'kyc',
      docType: 'GROUP_CONSTITUTION',
    });
  }
  if (client.group_photo_uri) {
    docs.push({
      key: 'kyc-group-photo',
      title: 'Group photo (all members)',
      subtitle: 'KYC · Group',
      uri: client.group_photo_uri,
      source: 'kyc',
      docType: 'GROUP_PHOTO',
    });
  }
  return docs;
}

export default function ClientDocumentsScreen() {
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const router = useRouter();
  const goToParent = () => {
    if (!id) {
      if (router.canGoBack()) router.back();
      return;
    }
    goToStaffClientParent(router, { clientId: String(id), section: 'documents', returnTo });
  };
  const [documents, setDocuments] = useState<ApiClientDocument[]>([]);
  const [kycDocs, setKycDocs] = useState<DocListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<CustomerPortalDocumentType>('ID_PROOF');
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [items, client] = await Promise.all([
        getClientDocuments(Number(id)).catch(() => [] as ApiClientDocument[]),
        getClient(id).catch(() => null),
      ]);
      setDocuments(items);
      setKycDocs(kycDocsFromClient(client));
    } catch {
      setDocuments([]);
      setKycDocs([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const listItems = useMemo<DocListItem[]>(() => {
    const records: DocListItem[] = documents.map((item) => ({
      key: `rec-${item.id}`,
      title: item.document_name,
      subtitle: `${labelForProfileDocType(item.document_type)} • ${new Date(item.uploaded_at).toLocaleDateString()}`,
      uri: item.document_url,
      source: 'record',
      recordId: item.id,
      docType: item.document_type,
    }));
    return [...kycDocs, ...records];
  }, [documents, kycDocs]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPickedUri(asset.uri);
    setPickedName(asset.name ?? 'document');
    setPickedMime(asset.mimeType ?? guessMime(asset.name));
    if (!docName.trim()) setDocName(asset.name?.replace(/\.[^.]+$/, '') ?? 'Document');
  };

  const handleAdd = async () => {
    if (!docName.trim() || !docType || !pickedUri) {
      Alert.alert('Required', 'Select a document type and pick a file to upload.');
      return;
    }
    setSubmitting(true);
    try {
      await addClientDocument(Number(id), {
        document_type: docType,
        file_name: (pickedName || docName.trim()).replace(/\s+/g, '_') || 'document',
        uri: pickedUri,
        mime_type: pickedMime ?? guessMime(pickedName),
      });
      await fetchDocuments();
      setShowForm(false);
      setDocName('');
      setDocType('ID_PROOF');
      setPickedUri(null);
      setPickedName(null);
      setPickedMime(null);
    } catch (e: unknown) {
      const message = e instanceof Error && e.message.trim() ? e.message : 'Failed to upload document.';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (doc: DocListItem) => {
    if (doc.source !== 'record' || doc.recordId == null) {
      Alert.alert(
        'KYC document',
        'KYC identity documents are managed from Edit KYC on the client profile.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Edit KYC',
            onPress: () => router.push(staffClientKycHref(id)),
          },
        ]
      );
      return;
    }
    Alert.alert('Delete', `Remove "${doc.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteClientDocument(Number(id), doc.recordId!);
            await fetchDocuments();
          } catch (e: unknown) {
            const message =
              e instanceof Error && e.message.trim() ? e.message : 'Failed to delete document.';
            Alert.alert('Error', message);
          }
        },
      },
    ]);
  };

  const openDoc = (doc: DocListItem) => {
    const clientId = Number(id);
    openDocumentViewer(router, {
      uri: doc.uri,
      name: doc.title,
      docType: doc.docType,
      authApiUrl:
        doc.source === 'record' && doc.recordId != null && Number.isFinite(clientId)
          ? config.staff.clientDocumentFile(clientId, doc.recordId)
          : undefined,
    });
  };

  const selectedTypeLabel =
    PROFILE_DOC_TYPES.find((t) => t.value === docType)?.label ?? labelForProfileDocType(docType);

  return (
    <StaffDetailScreen
      title="Documents"
      subtitle={id ? `Client ${id}` : undefined}
      noPadding
      onBack={goToParent}
    >
      <FlatList
        style={{ flex: 1 }}
        data={listItems}
        keyExtractor={(item) => item.key}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDocuments} />}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <MaterialIcons name={showForm ? 'expand-less' : 'description'} size={20} color="#fff" />
            <ThemedText style={styles.addBtnText}>{showForm ? 'Hide form' : 'Add Document'}</ThemedText>
          </TouchableOpacity>
        }
        ListFooterComponent={
          showForm ? (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Document name *"
                value={docName}
                onChangeText={setDocName}
              />
              <ThemedText style={styles.fieldLabel}>Document type *</ThemedText>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => setTypePickerOpen(true)}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.selectBtnText}>{selectedTypeLabel}</ThemedText>
                <MaterialIcons name="arrow-drop-down" size={22} color={CoFiColors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickBtn} onPress={pickFile}>
                {pickedUri ? (
                  <DocumentThumbnail
                    localUri={pickedUri}
                    fileName={pickedName}
                    size={44}
                    showFileLabel
                  />
                ) : (
                  <MaterialIcons name="attach-file" size={18} color={CoFiColors.primary} />
                )}
                <ThemedText style={styles.pickBtnText}>
                  {pickedName ? pickedName : 'Pick PDF or image'}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.saveBtnText}>Upload Document</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.item} onPress={() => openDoc(item)} activeOpacity={0.7}>
            <DocumentThumbnail
              uri={item.uri}
              fileName={item.title}
              size={56}
              showFileLabel={!isImagePath(item.uri)}
              onPress={() => openDoc(item)}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <ThemedText style={styles.itemTitle}>{item.title}</ThemedText>
              <ThemedText style={styles.itemSub}>{item.subtitle}</ThemedText>
              <ThemedText style={styles.itemHint}>Tap to preview</ThemedText>
            </View>
            <TouchableOpacity onPress={() => openDoc(item)} style={styles.viewBtn}>
              <MaterialIcons name="visibility" size={20} color={CoFiColors.primary} />
            </TouchableOpacity>
            {item.source === 'record' ? (
              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
                <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <ThemedText style={styles.empty}>No documents recorded.</ThemedText>
          ) : null
        }
      />

      <Modal visible={typePickerOpen} transparent animationType="fade" onRequestClose={() => setTypePickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTypePickerOpen(false)}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Select document type</ThemedText>
            {PROFILE_DOC_TYPES.map((opt) => {
              const active = opt.value === docType;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.modalOption, active && styles.modalOptionActive]}
                  onPress={() => {
                    setDocType(opt.value);
                    setTypePickerOpen(false);
                  }}
                >
                  <ThemedText style={[styles.modalOptionText, active && styles.modalOptionTextActive]}>
                    {opt.label}
                  </ThemedText>
                  {active ? <MaterialIcons name="check" size={18} color={CoFiColors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 10,
    borderRadius: Radius.md,
    marginBottom: 16,
  },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  form: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', opacity: 0.7, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: CoFiColors.backgroundCard,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: CoFiColors.backgroundCard,
  },
  selectBtnText: { fontSize: 14, fontWeight: '600', color: CoFiColors.foreground, flex: 1 },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickBtnText: { color: CoFiColors.primary, fontWeight: '600', flex: 1 },
  saveBtn: {
    backgroundColor: CoFiColors.primary,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  itemTitle: { fontWeight: '600', fontSize: 15 },
  itemSub: { fontSize: 13, opacity: 0.6, marginTop: 2 },
  itemHint: { fontSize: 11, color: CoFiColors.primary, marginTop: 4, fontWeight: '600' },
  viewBtn: { padding: 8 },
  deleteBtn: { padding: 8 },
  empty: { textAlign: 'center', paddingVertical: 48, opacity: 0.5 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.lg,
    padding: 16,
    gap: 4,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
  },
  modalOptionActive: { backgroundColor: 'rgba(14,116,144,0.1)' },
  modalOptionText: { fontSize: 14, color: CoFiColors.foreground },
  modalOptionTextActive: { fontWeight: '700', color: CoFiColors.primary },
});
