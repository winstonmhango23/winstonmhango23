import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';

import { ClientHeader } from '@/components/client-ui';
import { DocumentThumbnail } from '@/components/ui/document-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Radius } from '@/constants/theme';
import {
  LOAN_REQUEST_DOC_TYPES,
  PROFILE_DOC_TYPES,
  labelForLoanRequestDocType,
  labelForProfileDocType,
  type CustomerPortalDocumentType,
} from '@/lib/client-portal/loan-document-types';
import { navigateBackToProfile } from '@/lib/client-portal/profile-navigation';
import { resolvePortfolioApplicationId } from '@/lib/client-portal/security-portfolio';
import { config } from '@/lib/config';
import * as data from '@/lib/data';
import type { BorrowerApplicationDocument, CustomerPortalDocument } from '@/lib/data/api';
import { openDocumentViewer } from '@/lib/media/open-document-viewer';
import { useApplicationsStore } from '@/store';

type HubTab = 'profile' | 'loan';

export default function ClientDocumentsHubScreen() {
  const router = useRouter();
  const applications = useApplicationsStore((s) => s.applications);
  const fetchApplications = useApplicationsStore((s) => s.fetchApplications);

  const [tab, setTab] = useState<HubTab>('profile');
  const [loading, setLoading] = useState(true);
  const [profileDocs, setProfileDocs] = useState<CustomerPortalDocument[]>([]);
  const [loanDocs, setLoanDocs] = useState<BorrowerApplicationDocument[]>([]);
  const [loadingLoanDocs, setLoadingLoanDocs] = useState(false);
  const [targetAppId, setTargetAppId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [profileDocType, setProfileDocType] = useState<CustomerPortalDocumentType>('ID_PROOF');
  const [loanDocType, setLoanDocType] = useState('NATIONAL_ID');
  const [notes, setNotes] = useState('');
  const [picked, setPicked] = useState<{ uri: string; name: string; mimeType?: string } | null>(
    null
  );
  const [uploading, setUploading] = useState(false);
  const [replacingLoanDocId, setReplacingLoanDocId] = useState<number | null>(null);

  const syncedApps = useMemo(() => {
    return applications
      .map((app) => {
        const id = resolvePortfolioApplicationId(app);
        if (id == null) return null;
        return {
          id,
          application_number: app.application_number,
          product_name: app.product_name,
          status: app.status,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a != null);
  }, [applications]);

  const selectedLoanApp = useMemo(
    () => syncedApps.find((a) => a.id === targetAppId) ?? null,
    [syncedApps, targetAppId]
  );

  const canEditLoanDocs = [
    'DRAFT',
    'SUBMITTED',
    'PENDING_REVIEW',
    'UNDER_REVIEW',
    'REJECTED',
    'READY_FOR_ACCOUNTANT',
  ].includes(String(selectedLoanApp?.status || '').toUpperCase());

  const remainingLoanDocTypes = useMemo(() => {
    const present = new Set(
      loanDocs.map((d) => String(d.doc_type || d.document_type || '').trim().toUpperCase()).filter(Boolean)
    );
    const remaining = LOAN_REQUEST_DOC_TYPES.filter((t) => !present.has(t.value));
    return remaining.length > 0 ? remaining : LOAN_REQUEST_DOC_TYPES.filter((t) => t.value === 'OTHER');
  }, [loanDocs]);

  useEffect(() => {
    if (replacingLoanDocId) return;
    if (remainingLoanDocTypes.length > 0 && !remainingLoanDocTypes.some((t) => t.value === loanDocType)) {
      setLoanDocType(remainingLoanDocTypes[0].value);
    }
  }, [remainingLoanDocTypes, loanDocType, replacingLoanDocId]);

  const loadProfile = useCallback(async () => {
    const docs = await data.getCustomerDocuments();
    setProfileDocs(docs.filter((d) => d.is_active !== false));
  }, []);

  const loadLoanDocs = useCallback(async (applicationId: number) => {
    setLoadingLoanDocs(true);
    try {
      setLoanDocs(await data.getBorrowerApplicationDocuments(applicationId));
    } catch {
      setLoanDocs([]);
    } finally {
      setLoadingLoanDocs(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([fetchApplications(), loadProfile()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load documents');
    } finally {
      setLoading(false);
    }
  }, [fetchApplications, loadProfile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (syncedApps.length === 1) {
      setTargetAppId(syncedApps[0].id);
      return;
    }
    if (targetAppId != null && !syncedApps.some((a) => a.id === targetAppId)) {
      setTargetAppId(null);
    }
  }, [syncedApps, targetAppId]);

  useEffect(() => {
    if (tab === 'loan' && targetAppId != null) {
      void loadLoanDocs(targetAppId);
    }
  }, [tab, targetAppId, loadLoanDocs]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPicked({
      uri: asset.uri,
      name: asset.name ?? 'document',
      mimeType: asset.mimeType ?? undefined,
    });
  };

  const handleUpload = async () => {
    if (!picked) {
      Alert.alert('Choose a file', 'Pick a PDF or image to upload.');
      return;
    }
    setUploading(true);
    try {
      if (tab === 'profile') {
        await data.uploadCustomerDocument({
          document_type: profileDocType,
          file_name: picked.name,
          uri: picked.uri,
          mime_type: picked.mimeType,
          client_upload_notes: notes.trim() || null,
        });
        await loadProfile();
        Alert.alert('Uploaded', 'Your profile document was saved.');
      } else {
        if (targetAppId == null) {
          Alert.alert('Select a loan request', 'Choose which application this document belongs to.');
          return;
        }
        if (!canEditLoanDocs) {
          Alert.alert('Locked', 'Documents can only be changed before the application is approved.');
          return;
        }
        const payload = {
          uri: picked.uri,
          name: picked.name,
          docType: loanDocType,
          mimeType: picked.mimeType,
        };
        if (replacingLoanDocId) {
          await data.updateBorrowerApplicationDocument(targetAppId, replacingLoanDocId, payload);
          Alert.alert('Replaced', 'Document updated on your loan request.');
        } else {
          await data.addBorrowerApplicationDocument(targetAppId, payload);
          Alert.alert('Uploaded', 'Document added to your loan request and client vault.');
        }
        setReplacingLoanDocId(null);
        await loadLoanDocs(targetAppId);
      }
      setPicked(null);
      setNotes('');
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Try again when online.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLoanDoc = (doc: BorrowerApplicationDocument) => {
    if (targetAppId == null || !canEditLoanDocs) return;
    const label =
      doc.document_name ||
      doc.file_name ||
      labelForLoanRequestDocType(doc.doc_type || doc.document_type || '') ||
      `Document #${doc.id}`;
    Alert.alert('Remove document', `Remove “${label}” from this loan request?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await data.deleteBorrowerApplicationDocument(targetAppId, doc.id);
              await loadLoanDocs(targetAppId);
            } catch (e) {
              Alert.alert('Remove failed', e instanceof Error ? e.message : 'Try again.');
            }
          })();
        },
      },
    ]);
  };

  const openProfileDoc = (doc: CustomerPortalDocument) => {
    openDocumentViewer(router, {
      name: doc.file_name || labelForProfileDocType(doc.document_type),
      docType: doc.document_type,
      authApiUrl: config.mobile.customerDocumentFile(doc.id),
    });
  };

  const openLoanDoc = (doc: BorrowerApplicationDocument) => {
    const label =
      doc.document_name ||
      doc.file_name ||
      doc.doc_type ||
      doc.document_type ||
      `Document #${doc.id}`;
    openDocumentViewer(router, {
      name: label,
      docType: doc.doc_type || doc.document_type || undefined,
      appId: targetAppId != null ? String(targetAppId) : undefined,
      authApiUrl: config.mobile.loanDocumentFile(doc.id),
    });
  };

  return (
    <View style={styles.root}>
      <ClientHeader
        title="My documents"
        subtitle="Profile & loan-request files"
        showBack
        onBack={() => navigateBackToProfile(router)}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
      >
        <ThemedText style={styles.intro}>
          Upload supporting documents for your profile or a specific loan request — the same files
          your loan officer sees in the portal.
        </ThemedText>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, tab === 'profile' && styles.tabActive]}
            onPress={() => setTab('profile')}
          >
            <ThemedText style={[styles.tabText, tab === 'profile' && styles.tabTextActive]}>
              Profile
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.tab, tab === 'loan' && styles.tabActive]}
            onPress={() => setTab('loan')}
          >
            <ThemedText style={[styles.tabText, tab === 'loan' && styles.tabTextActive]}>
              Loan requests
            </ThemedText>
          </Pressable>
        </View>

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

        {tab === 'loan' ? (
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Loan request
            </ThemedText>
            {syncedApps.length === 0 ? (
              <ThemedText style={styles.hint}>No synced loan requests yet.</ThemedText>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {syncedApps.map((app) => (
                  <Pressable
                    key={app.id}
                    onPress={() => setTargetAppId(app.id)}
                    style={[styles.chip, targetAppId === app.id && styles.chipActive]}
                  >
                    <ThemedText
                      style={[styles.chipText, targetAppId === app.id && styles.chipTextActive]}
                    >
                      {app.application_number}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {tab === 'profile' || canEditLoanDocs ? (
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              {replacingLoanDocId ? `Replace document #${replacingLoanDocId}` : 'Upload'}
            </ThemedText>
            {tab === 'loan' && replacingLoanDocId ? (
              <Pressable onPress={() => setReplacingLoanDocId(null)}>
                <ThemedText style={styles.hint}>Cancel replace</ThemedText>
              </Pressable>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {(tab === 'profile'
                ? PROFILE_DOC_TYPES
                : replacingLoanDocId
                  ? LOAN_REQUEST_DOC_TYPES
                  : remainingLoanDocTypes
              ).map((t) => {
                const active =
                  tab === 'profile' ? profileDocType === t.value : loanDocType === t.value;
                return (
                  <Pressable
                    key={t.value}
                    onPress={() => {
                      if (tab === 'profile') {
                        setProfileDocType(t.value as CustomerPortalDocumentType);
                      } else {
                        setLoanDocType(t.value);
                      }
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                      {t.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            {tab === 'profile' ? (
              <TextInput
                style={styles.input}
                placeholder="Notes for your officer (optional)"
                placeholderTextColor={ClientUI.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            ) : null}
            <Pressable style={styles.secondaryBtn} onPress={() => void pickFile()}>
              <MaterialIcons name="attach-file" size={18} color={ClientUI.colors.primary} />
              <ThemedText style={styles.secondaryBtnText}>
                {picked ? picked.name : 'Choose PDF or image'}
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, uploading && styles.btnDisabled]}
              onPress={() => void handleUpload()}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.primaryBtnText}>
                  {replacingLoanDocId ? 'Save replacement' : 'Upload document'}
                </ThemedText>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.section}>
            <ThemedText style={styles.hint}>
              This loan request is approved. Documents are view-only.
            </ThemedText>
          </View>
        )}

        <View style={styles.section}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            {tab === 'profile'
              ? `Profile documents (${profileDocs.length})`
              : `Request documents${targetAppId != null ? ` (${loanDocs.length})` : ''}`}
          </ThemedText>
          {tab === 'loan' && loadingLoanDocs ? (
            <ActivityIndicator color={ClientUI.colors.primary} style={{ marginVertical: 16 }} />
          ) : null}
          {tab === 'profile'
            ? profileDocs.map((doc) => {
                const authApiUrl = config.mobile.customerDocumentFile(doc.id);
                return (
                  <Pressable
                    key={doc.id}
                    style={styles.docRow}
                    onPress={() => openProfileDoc(doc)}
                  >
                    <DocumentThumbnail
                      serverPath={authApiUrl}
                      fileName={doc.file_name}
                      mimeType={doc.mime_type}
                      size={48}
                      showFileLabel
                      onPress={() => openProfileDoc(doc)}
                    />
                    <View style={{ flex: 1 }}>
                      <ThemedText type="defaultSemiBold">
                        {labelForProfileDocType(doc.document_type)}
                      </ThemedText>
                      <ThemedText style={styles.hint}>
                        {doc.file_name}
                        {doc.is_verified ? ' · Verified' : ''}
                      </ThemedText>
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
                  </Pressable>
                );
              })
            : loanDocs.map((doc) => {
                const label =
                  doc.document_name ||
                  doc.file_name ||
                  labelForLoanRequestDocType(doc.doc_type || doc.document_type || '');
                const authApiUrl = config.mobile.loanDocumentFile(doc.id);
                return (
                  <View key={doc.id} style={styles.docRow}>
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}
                      onPress={() => openLoanDoc(doc)}
                    >
                      <DocumentThumbnail
                        serverPath={authApiUrl}
                        fileName={doc.file_name || label}
                        mimeType={doc.mime_type}
                        size={48}
                        showFileLabel
                        onPress={() => openLoanDoc(doc)}
                      />
                      <View style={{ flex: 1 }}>
                        <ThemedText type="defaultSemiBold">{label}</ThemedText>
                        {doc.created_at ? (
                          <ThemedText style={styles.hint}>
                            {(doc.created_at || '').slice(0, 10)}
                          </ThemedText>
                        ) : null}
                      </View>
                    </Pressable>
                    {canEditLoanDocs ? (
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        <Pressable
                          onPress={() => {
                            setReplacingLoanDocId(doc.id);
                            setLoanDocType(
                              String(doc.doc_type || doc.document_type || 'OTHER').toUpperCase()
                            );
                            setPicked(null);
                          }}
                          hitSlop={8}
                        >
                          <MaterialIcons name="swap-horiz" size={22} color={ClientUI.colors.primary} />
                        </Pressable>
                        <Pressable onPress={() => handleRemoveLoanDoc(doc)} hitSlop={8}>
                          <MaterialIcons name="delete-outline" size={22} color="#b91c1c" />
                        </Pressable>
                      </View>
                    ) : (
                      <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
                    )}
                  </View>
                );
              })}
          {tab === 'profile' && !loading && profileDocs.length === 0 ? (
            <ThemedText style={styles.empty}>No profile documents uploaded yet.</ThemedText>
          ) : null}
          {tab === 'loan' && !loadingLoanDocs && targetAppId != null && loanDocs.length === 0 ? (
            <ThemedText style={styles.empty}>No documents on this loan request yet.</ThemedText>
          ) : null}
          {tab === 'loan' && targetAppId == null && syncedApps.length > 0 ? (
            <ThemedText style={styles.empty}>Select a loan request to view its documents.</ThemedText>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 13, lineHeight: 19, color: ClientUI.colors.textMuted, marginBottom: 14 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    alignItems: 'center',
    backgroundColor: ClientUI.colors.surface,
  },
  tabActive: {
    backgroundColor: ClientUI.colors.primary,
    borderColor: ClientUI.colors.primary,
  },
  tabText: { fontSize: 13, color: ClientUI.colors.text, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  section: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    marginBottom: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 15, marginBottom: 2 },
  chips: { gap: 8, paddingBottom: 2 },
  chip: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: ClientUI.colors.primary, borderColor: ClientUI.colors.primary },
  chipText: { fontSize: 12, color: ClientUI.colors.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: ClientUI.colors.text,
    backgroundColor: ClientUI.colors.canvas,
    minHeight: 44,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: ClientUI.colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  secondaryBtnText: { color: ClientUI.colors.primary, fontWeight: '600', flex: 1 },
  primaryBtn: {
    backgroundColor: ClientUI.colors.primary,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  btnDisabled: { opacity: 0.7 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ClientUI.colors.border,
  },
  hint: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', paddingVertical: 20, opacity: 0.55 },
  error: { color: ClientUI.colors.danger, marginBottom: 10, fontSize: 13 },
});
