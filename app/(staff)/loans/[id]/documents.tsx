import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { getStoredAuth } from '@/lib/storage';
import * as api from '@/lib/data/api';
import { uploadStaffDocumentFile } from '@/lib/data/mediaService';
import { config } from '@/lib/config';
import { openStaffLoanDocument } from '@/lib/media/open-document-viewer';
import { isImagePath } from '@/lib/media/resolve-upload-url';

export default function LoanDocumentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const loanId = parseInt(id ?? '0', 10);
  const [docs, setDocs] = useState<api.ApiLoanDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      setDocs(await api.apiGetLoanDocuments(auth.token, loanId));
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void fetchDocs();
  }, [loanId]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPickedUri(asset.uri);
    setPickedName(asset.name ?? 'document');
    if (!docName.trim()) setDocName(asset.name?.replace(/\.[^.]+$/, '') ?? 'Document');
  };

  const handleAdd = async () => {
    if (!docName.trim() || !pickedUri) {
      Alert.alert('Required', 'Enter name and pick a file.');
      return;
    }
    setSubmitting(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const uploaded = await uploadStaffDocumentFile(pickedUri, auth.token, {
        fileName: pickedName ?? undefined,
        prefix: 'loan-documents',
      });
      await api.apiAddLoanDocument(auth.token, loanId, {
        document_name: docName.trim(),
        document_type: docType.trim() || 'OTHER',
        document_url: uploaded.url || uploaded.key,
      });
      await fetchDocs();
      setShowForm(false);
      setDocName('');
      setDocType('');
      setPickedUri(null);
      setPickedName(null);
      Alert.alert('Success', 'Document uploaded.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to upload document.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffDetailScreen title="Documents" subtitle={id ? `Loan ${id}` : undefined} noPadding>
      <FlatList
        style={{ flex: 1 }}
        data={docs}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDocs} />}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <MaterialIcons name={showForm ? 'expand-less' : 'add'} size={20} color="#fff" />
            <ThemedText style={styles.addBtnText}>{showForm ? 'Hide' : 'Add Document'}</ThemedText>
          </TouchableOpacity>
        }
        ListFooterComponent={
          showForm ? (
            <View style={styles.form}>
              <TextInput style={styles.input} placeholder="Document name" value={docName} onChangeText={setDocName} />
              <TextInput style={styles.input} placeholder="Type (e.g. LOAN_AGREEMENT)" value={docType} onChangeText={setDocType} />
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
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={styles.saveBtnText}>Upload Document</ThemedText>}
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.item}
            onPress={() =>
              openStaffLoanDocument(router, {
                documentId: item.id,
                name: item.document_name,
                docType: item.document_type,
                storedUrl: item.document_url,
              })
            }
          >
            <DocumentThumbnail
              uri={item.document_url}
              serverPath={config.staff.loanDocumentFile(item.id)}
              fileName={item.document_name}
              size={56}
              showFileLabel={!isImagePath(item.document_url) && !isImagePath(item.document_name)}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <ThemedText style={styles.itemTitle}>{item.document_name}</ThemedText>
              <ThemedText style={styles.itemSub}>
                {item.document_type} • {new Date(item.uploaded_at).toLocaleDateString()}
              </ThemedText>
              <ThemedText style={styles.itemHint}>Tap to preview</ThemedText>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={CoFiColors.mutedForeground} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={!loading ? <ThemedText style={styles.empty}>No documents.</ThemedText> : null}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: CoFiColors.primary, paddingVertical: 10, borderRadius: Radius.md, marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  form: { backgroundColor: CoFiColors.backgroundCard, borderRadius: Radius.md, padding: 14, marginBottom: 16, gap: 10, borderWidth: 1, borderColor: CoFiColors.border },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  pickBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: CoFiColors.primary, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 12 },
  pickBtnText: { color: CoFiColors.primary, fontWeight: '600', flex: 1 },
  saveBtn: { backgroundColor: CoFiColors.primary, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoFiColors.backgroundCard, borderRadius: Radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: CoFiColors.border },
  itemTitle: { fontWeight: '600', fontSize: 15 },
  itemSub: { fontSize: 12, opacity: 0.5, marginTop: 2 },
  itemHint: { fontSize: 11, color: CoFiColors.primary, marginTop: 4, fontWeight: '600' },
  empty: { textAlign: 'center', paddingVertical: 48, opacity: 0.5 },
});
