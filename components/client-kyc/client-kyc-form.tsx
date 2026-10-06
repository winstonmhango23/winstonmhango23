import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AuthPrimaryButton, AuthTextField, ClientChipRow } from '@/components/client-ui';
import { KycDocumentUploadField } from '@/components/client-kyc/kyc-document-upload-field';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  fetchMobileKyc,
  fetchMobileSession,
  type KycUploadField,
} from '@/lib/client-portal/api';
import { persistKycDocumentsThenSave } from '@/lib/client-portal/kyc-save-with-documents';
import {
  consumeKycUploadResults,
} from '@/lib/client-portal/kyc-offline-upload';
import {
  calculateKYCCompletion,
  type ClientKYCData,
} from '@/lib/client-portal/kyc-completion-calculator';
import {
  normalizeKycFieldValue,
  prepareKycDataForCompletion,
  resolveKycClientType,
  applyKycFormDefaults,
  isOrganizationKycClientType,
  sanitizeKycPayloadForClientType,
} from '@/lib/client-portal/kyc-data-normalizer';
import {
  clientAuthDestinationHref,
  resolveClientAuthDestination,
  withOptimisticKycSession,
} from '@/lib/client-portal/kyc-routing';
import { applyMobileSessionToAuth } from '@/lib/client-portal/session-auth';
import { useAuthStore } from '@/store/auth';
import { useClientSessionStore } from '@/store/client-session';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

const GENDER_OPTIONS = [
  { key: 'M', label: 'Male' },
  { key: 'F', label: 'Female' },
] as const;

const MARITAL_OPTIONS = [
  { key: 'SINGLE', label: 'Single' },
  { key: 'MARRIED', label: 'Married' },
  { key: 'DIVORCED', label: 'Divorced' },
  { key: 'WIDOWED', label: 'Widowed' },
] as const;

/** Optional community for group/org KYC (None allowed). */
const COMMUNITY_OPTIONS = [
  { key: '', label: 'None/Other' },
  { key: 'Village', label: 'Village' },
  { key: 'Town', label: 'Town' },
] as const;

/** Required community for SME personal KYC (matches portal + calculator). */
const SME_COMMUNITY_OPTIONS = [
  { key: 'Village', label: 'Village' },
  { key: 'Town', label: 'Town' },
] as const;

type ClientKycFormProps = {
  variant: 'standalone' | 'in-shell';
};

export function ClientKycForm({ variant }: ClientKycFormProps) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kycData, setKycData] = useState<ClientKYCData>({});
  const [sessionClientType, setSessionClientType] = useState('');
  const [groupName, setGroupName] = useState('');
  const [editingEmployer, setEditingEmployer] = useState(false);
  const [localPreviews, setLocalPreviews] = useState<Partial<Record<KycUploadField, string>>>({});

  const completion = useMemo(() => {
    const payload = prepareKycDataForCompletion(kycData, sessionClientType);
    return calculateKYCCompletion(payload);
  }, [kycData, sessionClientType]);

  const incompleteRequired = useMemo(
    () => completion.fields.filter((f) => f.isRequired && !f.isComplete),
    [completion.fields]
  );

  const effectiveClientType = resolveKycClientType(kycData, sessionClientType);
  const isGroupClient = isOrganizationKycClientType(effectiveClientType);
  const isSmeClient = effectiveClientType.toUpperCase() === 'SME';

  const loadData = useCallback(async () => {
    if (!token) {
      router.replace('/login');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [data, session] = await Promise.all([
        fetchMobileKyc(token),
        fetchMobileSession(token),
      ]);
      useClientSessionStore.getState().setSession(session);

      const prepared = applyKycFormDefaults(
        prepareKycDataForCompletion(data, session.client_type),
        session.client_type
      );
      if (isOrganizationKycClientType(session.client_type) && !prepared.employer) {
        prepared.employer = session.full_name;
      }
      setGroupName(session.full_name);
      setSessionClientType(session.client_type || '');
      setKycData(prepared);

      const syncedPaths = await consumeKycUploadResults();
      if (Object.keys(syncedPaths).length > 0) {
        setKycData((prev) => ({ ...prev, ...syncedPaths }));
      }

      if (variant === 'standalone' && session.has_existing_loans) {
        router.replace('/(client)/kyc' as never);
        return;
      }
      const dest = resolveClientAuthDestination(session, prepared);
      if (dest === '/(client)') {
        const optimistic = withOptimisticKycSession(session, prepared);
        useClientSessionStore.getState().setSession(optimistic);
        router.replace('/(client)');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load KYC data');
    } finally {
      setLoading(false);
    }
  }, [token, router, variant]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFieldChange = (field: keyof ClientKYCData, value: string | number | null) => {
    setKycData((prev) => ({
      ...prev,
      [field]: normalizeKycFieldValue(field, value),
    }));
  };

  const handleSubmit = async () => {
    if (!token) return;
    if (!completion.isComplete) {
      const missing = incompleteRequired.map((f) => f.label).join(', ');
      Alert.alert(
        'Incomplete KYC',
        missing
          ? `Please complete: ${missing}`
          : 'Please complete all required fields before submitting.'
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = sanitizeKycPayloadForClientType(
        prepareKycDataForCompletion(kycData, sessionClientType)
      );
      const result = await persistKycDocumentsThenSave(token, payload, localPreviews);
      if (result === 'queued') {
        setSaving(false);
        Alert.alert(
          'Saved on this device',
          'Your KYC details are saved and will upload automatically when you are back online.',
          [{ text: 'OK', onPress: () => router.replace(clientAuthDestinationHref('/(client)')) }]
        );
        return;
      }
      const [session, savedKyc] = await Promise.all([
        fetchMobileSession(token),
        fetchMobileKyc(token).catch(() => payload),
      ]);
      const kycForRouting = Object.keys(savedKyc || {}).length > 0 ? savedKyc : payload;
      const optimistic = withOptimisticKycSession(session, kycForRouting);
      useClientSessionStore.getState().setSession(optimistic);
      await applyMobileSessionToAuth(optimistic, token);
      // Fresh home bootstrap after first KYC completion.
      useHomeBootstrapStore.getState().reset();
      const dest = resolveClientAuthDestination(optimistic, kycForRouting);
      router.replace(clientAuthDestinationHref(dest));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save KYC data');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ClientUI.colors.primary} />
        <ThemedText style={styles.loadingText}>Loading your profile…</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <ThemedText style={styles.progressTitle}>KYC completion</ThemedText>
          <ThemedText style={styles.progressPct}>{completion.requiredPercentage}%</ThemedText>
        </View>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${completion.requiredPercentage}%` }]} />
        </View>
        <ThemedText style={styles.progressHint}>
          {completion.isComplete
            ? isGroupClient
              ? 'Group KYC is complete. Submit to access your dashboard.'
              : 'Your KYC is complete. Submit to access your dashboard.'
            : isGroupClient
              ? 'Complete all required group fields to proceed.'
              : 'Complete all required personal fields to proceed.'}
        </ThemedText>
        {!completion.isComplete && incompleteRequired.length > 0 ? (
          <View style={styles.missingList}>
            <ThemedText style={styles.missingTitle}>Still required:</ThemedText>
            {incompleteRequired.map((field) => (
              <ThemedText key={field.field} style={styles.missingItem}>
                • {field.label}
              </ThemedText>
            ))}
          </View>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <MaterialIcons name="error-outline" size={18} color={ClientUI.colors.danger} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      ) : null}

      {!isGroupClient ? (
        <Section title="Identity information" required>
          <AuthTextField
            value={kycData.national_id ?? ''}
            onChangeText={(v) => handleFieldChange('national_id', v)}
            placeholder="National ID / passport number *"
          />
          <AuthTextField
            value={kycData.date_of_birth ?? ''}
            onChangeText={(v) => handleFieldChange('date_of_birth', v)}
            placeholder="Date of birth (YYYY-MM-DD) *"
          />
        </Section>
      ) : (
        <Section title="Organization information" required>
          <ThemedText style={styles.help}>
            Group registration and legal details — not personal national ID fields.
          </ThemedText>
          <AuthTextField
            value={kycData.registration_number ?? ''}
            onChangeText={(v) => handleFieldChange('registration_number', v)}
            placeholder="Registration number (or provide village info below)"
          />
          <AuthTextField
            value={kycData.registration_date ?? ''}
            onChangeText={(v) => handleFieldChange('registration_date', v)}
            placeholder="Registration date (YYYY-MM-DD) *"
          />
          <ThemedText style={styles.subLabel}>Community type</ThemedText>
          <ClientChipRow
            options={COMMUNITY_OPTIONS}
            value={kycData.community_type ?? ''}
            onChange={(v) => handleFieldChange('community_type', v)}
          />
          {String(kycData.community_type || '').toUpperCase() === 'VILLAGE' ? (
            <>
              <AuthTextField
                value={kycData.village_head ?? ''}
                onChangeText={(v) => handleFieldChange('village_head', v)}
                placeholder="Village head name *"
              />
              <AuthTextField
                value={kycData.village_head_phone ?? ''}
                onChangeText={(v) => handleFieldChange('village_head_phone', v)}
                placeholder="Village head phone *"
                keyboardType="phone-pad"
              />
            </>
          ) : null}
        </Section>
      )}

      <Section title={isGroupClient ? 'Group contact' : 'Contact'} required>
        <AuthTextField
          value={kycData.email ?? ''}
          onChangeText={(v) => handleFieldChange('email', v)}
          placeholder={isGroupClient ? 'Group email (optional)' : 'Email (optional)'}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <AuthTextField
          value={kycData.phone_number ?? ''}
          onChangeText={(v) => handleFieldChange('phone_number', v)}
          placeholder={isGroupClient ? 'Group phone number *' : 'Phone number *'}
          keyboardType="phone-pad"
        />
        <AuthTextField
          value={kycData.address ?? ''}
          onChangeText={(v) => handleFieldChange('address', v)}
          placeholder={
            isGroupClient ? 'Group office / meeting address *' : 'Physical address *'
          }
        />
      </Section>

      {!isGroupClient ? (
        <Section title="Personal information" required>
          <ThemedText style={styles.subLabel}>Gender *</ThemedText>
          <ClientChipRow
            options={GENDER_OPTIONS}
            value={(kycData.gender as 'M' | 'F') || 'M'}
            onChange={(v) => handleFieldChange('gender', v)}
          />
          <ThemedText style={styles.subLabel}>Marital status *</ThemedText>
          <ClientChipRow
            options={MARITAL_OPTIONS}
            value={
              (kycData.marital_status as (typeof MARITAL_OPTIONS)[number]['key']) || 'SINGLE'
            }
            onChange={(v) => handleFieldChange('marital_status', v)}
          />
          <AuthTextField
            value={kycData.occupation ?? ''}
            onChangeText={(v) => handleFieldChange('occupation', v)}
            placeholder="Occupation *"
          />
          <ThemedText style={styles.sectionSubtitle}>Next of kin</ThemedText>
          <AuthTextField
            value={kycData.next_of_kin_name ?? ''}
            onChangeText={(v) => handleFieldChange('next_of_kin_name', v)}
            placeholder="Next of kin name *"
          />
          <AuthTextField
            value={kycData.next_of_kin_phone ?? ''}
            onChangeText={(v) => handleFieldChange('next_of_kin_phone', v)}
            placeholder="Next of kin phone *"
            keyboardType="phone-pad"
          />
          <AuthTextField
            value={kycData.next_of_kin_relationship ?? ''}
            onChangeText={(v) => handleFieldChange('next_of_kin_relationship', v)}
            placeholder="Relationship to you *"
          />
        </Section>
      ) : null}

      {isSmeClient ? (
        <Section title="Community" required>
          <ThemedText style={styles.subLabel}>Community type *</ThemedText>
          <ClientChipRow
            options={SME_COMMUNITY_OPTIONS}
            value={kycData.community_type ?? ''}
            onChange={(v) => handleFieldChange('community_type', v)}
          />
          {String(kycData.community_type || '').toUpperCase() === 'VILLAGE' ? (
            <>
              <AuthTextField
                value={kycData.village_head ?? ''}
                onChangeText={(v) => handleFieldChange('village_head', v)}
                placeholder="Village head name *"
              />
              <AuthTextField
                value={kycData.village_head_phone ?? ''}
                onChangeText={(v) => handleFieldChange('village_head_phone', v)}
                placeholder="Village head phone *"
                keyboardType="phone-pad"
              />
            </>
          ) : null}
        </Section>
      ) : null}

      {isGroupClient ? (
        <>
          <Section title="Group leadership" required>
            <ThemedText style={styles.help}>
              Leaders of this group account — enter each officer’s name and phone.
            </ThemedText>
            <ThemedText style={styles.sectionSubtitle}>Chairperson</ThemedText>
            <AuthTextField
              value={kycData.chairperson_name ?? ''}
              onChangeText={(v) => handleFieldChange('chairperson_name', v)}
              placeholder="Chairperson full name *"
            />
            <AuthTextField
              value={kycData.chairperson_phone ?? ''}
              onChangeText={(v) => handleFieldChange('chairperson_phone', v)}
              placeholder="Chairperson phone *"
              keyboardType="phone-pad"
            />
            <ThemedText style={styles.sectionSubtitle}>Secretary</ThemedText>
            <AuthTextField
              value={kycData.secretary_name ?? ''}
              onChangeText={(v) => handleFieldChange('secretary_name', v)}
              placeholder="Secretary full name *"
            />
            <AuthTextField
              value={kycData.secretary_phone ?? ''}
              onChangeText={(v) => handleFieldChange('secretary_phone', v)}
              placeholder="Secretary phone *"
              keyboardType="phone-pad"
            />
            <ThemedText style={styles.sectionSubtitle}>Treasurer</ThemedText>
            <AuthTextField
              value={kycData.treasurer_name ?? ''}
              onChangeText={(v) => handleFieldChange('treasurer_name', v)}
              placeholder="Treasurer full name *"
            />
            <AuthTextField
              value={kycData.treasurer_phone ?? ''}
              onChangeText={(v) => handleFieldChange('treasurer_phone', v)}
              placeholder="Treasurer phone *"
              keyboardType="phone-pad"
            />
          </Section>
          <Section title="Group details" required>
            <AuthTextField
              value={kycData.group_purpose ?? ''}
              onChangeText={(v) => handleFieldChange('group_purpose', v)}
              placeholder="Group purpose / objectives *"
            />
            <AuthTextField
              value={kycData.meeting_schedule ?? ''}
              onChangeText={(v) => handleFieldChange('meeting_schedule', v)}
              placeholder="Meeting schedule *"
            />
            <AuthTextField
              value={kycData.member_count != null ? String(kycData.member_count) : ''}
              onChangeText={(v) =>
                handleFieldChange('member_count', v.trim() ? parseInt(v, 10) || null : null)
              }
              placeholder="Number of members *"
              keyboardType="number-pad"
            />
          </Section>
        </>
      ) : null}

      <Section
        title={isGroupClient ? 'Organization documents' : 'Identity documents'}
        required
      >
        {!isGroupClient && token ? (
          <>
            <ThemedText style={styles.help}>
              Upload a clear profile photo and both sides of the national ID. Each upload shows a
              preview below.
            </ThemedText>
            <KycDocumentUploadField
              label="Profile photo (optional)"
              field="profile_photo_path"
              token={token}
              variant="profile"
              required={false}
              helperText="Clear face photo of the account holder"
              serverPath={kycData.profile_photo_path}
              localPreviewUri={localPreviews.profile_photo_path}
              onUploaded={(path, localUri) => {
                handleFieldChange('profile_photo_path', path);
                setLocalPreviews((prev) => ({ ...prev, profile_photo_path: localUri }));
              }}
              onLocalPreview={(uri) =>
                setLocalPreviews((prev) => ({
                  ...prev,
                  profile_photo_path: uri ?? undefined,
                }))
              }
            />
            <ThemedText style={styles.sectionSubtitle}>National ID — both sides</ThemedText>
            <ThemedText style={styles.help}>
              Front is required. Back is strongly recommended so both sides of the card are on file.
            </ThemedText>
            <KycDocumentUploadField
              label="National ID — Front"
              field="id_document_path"
              token={token}
              variant="id"
              required
              helperText="Front side of the national ID card"
              serverPath={kycData.id_document_path}
              localPreviewUri={localPreviews.id_document_path}
              onUploaded={(path, localUri) => {
                handleFieldChange('id_document_path', path);
                setLocalPreviews((prev) => ({ ...prev, id_document_path: localUri }));
              }}
              onLocalPreview={(uri) =>
                setLocalPreviews((prev) => ({
                  ...prev,
                  id_document_path: uri ?? undefined,
                }))
              }
            />
            <KycDocumentUploadField
              label="National ID — Back"
              field="id_document_back_path"
              token={token}
              variant="id"
              helperText="Back side of the national ID card"
              serverPath={kycData.id_document_back_path}
              localPreviewUri={localPreviews.id_document_back_path}
              onUploaded={(path, localUri) => {
                handleFieldChange('id_document_back_path', path);
                setLocalPreviews((prev) => ({ ...prev, id_document_back_path: localUri }));
              }}
              onLocalPreview={(uri) =>
                setLocalPreviews((prev) => ({
                  ...prev,
                  id_document_back_path: uri ?? undefined,
                }))
              }
            />
          </>
        ) : token ? (
          <>
            <ThemedText style={styles.help}>
              Upload the group constitution and a group photo of all members — not personal national ID
              photos. A preview appears after upload (image or PDF).
            </ThemedText>
            <KycDocumentUploadField
              label="Group constitution document"
              field="group_constitution_path"
              token={token}
              variant="constitution"
              required
              helperText="Signed group constitution or registration document"
              serverPath={kycData.group_constitution_path}
              localPreviewUri={localPreviews.group_constitution_path}
              onUploaded={(path, localUri) => {
                handleFieldChange('group_constitution_path', path);
                setLocalPreviews((prev) => ({ ...prev, group_constitution_path: localUri }));
              }}
              onLocalPreview={(uri) =>
                setLocalPreviews((prev) => ({
                  ...prev,
                  group_constitution_path: uri ?? undefined,
                }))
              }
            />
            <KycDocumentUploadField
              label="Group photo (all members)"
              field="group_photo_path"
              token={token}
              variant="profile"
              required
              helperText="One shared photo showing the group members together"
              serverPath={kycData.group_photo_path}
              localPreviewUri={localPreviews.group_photo_path}
              onUploaded={(path, localUri) => {
                handleFieldChange('group_photo_path', path);
                setLocalPreviews((prev) => ({ ...prev, group_photo_path: localUri }));
              }}
              onLocalPreview={(uri) =>
                setLocalPreviews((prev) => ({
                  ...prev,
                  group_photo_path: uri ?? undefined,
                }))
              }
            />
          </>
        ) : null}
      </Section>

      <Section title={isGroupClient ? 'Group finances (optional)' : 'Financial (optional)'}>
        <View style={styles.employerRow}>
          <View style={{ flex: 1 }}>
            <AuthTextField
              value={kycData.employer ?? ''}
              onChangeText={(v) => handleFieldChange('employer', v)}
              placeholder={isGroupClient ? 'Organization name' : 'Employer'}
              editable={!isGroupClient || editingEmployer}
            />
          </View>
          {isGroupClient ? (
            <Pressable style={styles.editBtn} onPress={() => setEditingEmployer((v) => !v)}>
              <MaterialIcons name="edit" size={20} color={ClientUI.colors.primary} />
            </Pressable>
          ) : null}
        </View>
        {isGroupClient && !editingEmployer ? (
          <ThemedText style={styles.help}>
            Pre-filled from your group registration ({groupName}). Tap edit to enter a different
            name for financial purposes.
          </ThemedText>
        ) : null}
        <MwkMoneyInput
          label={isGroupClient ? 'Monthly income / revenue' : 'Monthly income'}
          valueMinor={typeof kycData.monthly_income === 'number' ? kycData.monthly_income : null}
          onChangeMinor={(minor) => handleFieldChange('monthly_income', minor)}
          placeholder="MWK 0"
        />
        <AuthTextField
          value={kycData.bank_name ?? ''}
          onChangeText={(v) => handleFieldChange('bank_name', v)}
          placeholder="Bank name"
        />
        <AuthTextField
          value={kycData.bank_branch ?? ''}
          onChangeText={(v) => handleFieldChange('bank_branch', v)}
          placeholder="Bank branch"
        />
        <AuthTextField
          value={kycData.bank_account_number ?? ''}
          onChangeText={(v) => handleFieldChange('bank_account_number', v)}
          placeholder="Account number"
        />
        <AuthTextField
          value={kycData.bank_account_name ?? ''}
          onChangeText={(v) => handleFieldChange('bank_account_name', v)}
          placeholder={isGroupClient ? 'Account name (group)' : 'Account holder name'}
        />
      </Section>

      <AuthPrimaryButton
        label="Submit KYC"
        onPress={handleSubmit}
        loading={saving}
        disabled={saving || !completion.isComplete}
      />
    </View>
  );
}

function Section({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        {required ? <ThemedText style={styles.badgeRequired}>Required</ThemedText> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { fontFamily: Fonts.sans, fontSize: 14, color: ClientUI.colors.textMuted },
  progressCard: {
    backgroundColor: ClientUI.colors.primarySoft,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(10,61,122,0.15)',
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: ClientUI.colors.text },
  progressPct: { fontFamily: Fonts.sansSemiBold, fontSize: 18, color: ClientUI.colors.primary },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(10,61,122,0.12)',
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: ClientUI.colors.primary, borderRadius: 4 },
  progressHint: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted },
  missingList: {
    marginTop: 4,
    gap: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(10,61,122,0.12)',
  },
  missingTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.text,
  },
  missingItem: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: ClientUI.colors.danger,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.2)',
  },
  errorText: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.danger },
  section: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: ClientUI.colors.text },
  sectionSubtitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    marginTop: 4,
  },
  badgeRequired: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  subLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: ClientUI.colors.textMuted },
  employerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  editBtn: {
    marginTop: 28,
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ClientUI.colors.primarySoft,
  },
  help: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted, lineHeight: 17 },
});
