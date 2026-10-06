import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AuthTextField, ClientChipRow } from '@/components/client-ui';
import { StaffKycDocumentField } from '@/components/staff-clients/staff-kyc-document-field';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { CoFiColors, Fonts, Radius } from '@/constants/theme';
import type { KycUploadField } from '@/lib/client-portal/api';
import type { PublicRegistrationDistrict } from '@/lib/client-portal/api';
import { fetchPublicRegistrationDistrictsCached } from '@/lib/client-portal/registration-cache';
import {
  calculateKYCCompletion,
  type ClientKYCData,
} from '@/lib/client-portal/kyc-completion-calculator';
import {
  normalizeKycFieldValue,
  prepareKycDataForCompletion,
  applyKycFormDefaults,
  isOrganizationKycClientType,
  sanitizeKycPayloadForClientType,
  staffFinishMissingFieldLabels,
  staffFinishRequiredPercentage,
} from '@/lib/client-portal/kyc-data-normalizer';
import { apiGetStaffProfile } from '@/lib/data/api';

const CLIENT_TYPES = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'SME', label: 'SME' },
  { value: 'COOPERATIVE', label: 'Cooperative' },
  { value: 'GROUP', label: 'Group' },
] as const;

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

const COMMUNITY_OPTIONS = [
  { key: '', label: 'None/Other' },
  { key: 'Village', label: 'Village' },
  { key: 'Town', label: 'Town' },
] as const;

export type StaffClientCreateFormValue = {
  fullName: string;
  clientType: 'INDIVIDUAL' | 'SME' | 'COOPERATIVE' | 'GROUP';
  districtId: number | '';
  kycData: ClientKYCData;
  localPreviews: Partial<Record<KycUploadField, string>>;
};

type StaffClientCreateFormProps = {
  submitting: boolean;
  onSubmitDraft: (value: StaffClientCreateFormValue) => Promise<void>;
  onSubmitFinished: (value: StaffClientCreateFormValue) => Promise<void>;
  /** Prefill for editing an existing client's KYC. */
  initialValue?: Partial<StaffClientCreateFormValue> | null;
  /** When editing, lock client type changes unless explicitly allowed. */
  lockClientType?: boolean;
};

export function StaffClientCreateForm({
  submitting,
  onSubmitDraft,
  onSubmitFinished,
  initialValue,
  lockClientType = false,
}: StaffClientCreateFormProps) {
  const [fullName, setFullName] = useState(initialValue?.fullName ?? '');
  const [clientType, setClientType] =
    useState<StaffClientCreateFormValue['clientType']>(
      initialValue?.clientType ?? 'INDIVIDUAL'
    );
  const [districtId, setDistrictId] = useState<number | ''>(initialValue?.districtId ?? '');
  const [kycData, setKycData] = useState<ClientKYCData>(initialValue?.kycData ?? {});
  const [localPreviews, setLocalPreviews] = useState<
    Partial<Record<KycUploadField, string>>
  >(initialValue?.localPreviews ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hydratedFromInitial, setHydratedFromInitial] = useState(!initialValue);

  const [districts, setDistricts] = useState<PublicRegistrationDistrict[]>([]);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [districtPickerOpen, setDistrictPickerOpen] = useState(false);
  const [staffBranchId, setStaffBranchId] = useState<number | null>(null);

  useEffect(() => {
    if (!initialValue || hydratedFromInitial) return;
    if (initialValue.fullName != null) setFullName(initialValue.fullName);
    if (initialValue.clientType) setClientType(initialValue.clientType);
    if (initialValue.districtId !== undefined) setDistrictId(initialValue.districtId);
    if (initialValue.kycData) setKycData(initialValue.kycData);
    if (initialValue.localPreviews) setLocalPreviews(initialValue.localPreviews);
    setHydratedFromInitial(true);
  }, [initialValue, hydratedFromInitial]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { useAuthStore } = await import('@/store/auth');
        const token = useAuthStore.getState().token;
        if (!token) return;
        const profile = await apiGetStaffProfile(token);
        if (cancelled) return;
        setStaffBranchId(profile.branch_id ?? null);
        if (profile.branch_id != null) {
          setDistrictsLoading(true);
          const { districts: list } = await fetchPublicRegistrationDistrictsCached(
            profile.branch_id
          );
          if (!cancelled) {
            setDistricts(list);
            setDistrictId((current) =>
              current === '' && list.length === 1 ? list[0].id : current
            );
          }
        }
      } catch {
        /* optional */
      } finally {
        if (!cancelled) setDistrictsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const preparedKyc = useMemo(
    () => prepareKycDataForCompletion({ ...kycData, client_type: clientType }, clientType),
    [kycData, clientType]
  );

  const completion = useMemo(() => calculateKYCCompletion(preparedKyc), [preparedKyc]);
  const staffMissingLabels = useMemo(
    () => staffFinishMissingFieldLabels(completion.fields, preparedKyc.client_type || clientType),
    [completion.fields, preparedKyc.client_type, clientType]
  );
  const staffRequiredPercentage = useMemo(
    () => staffFinishRequiredPercentage(completion.fields),
    [completion.fields]
  );

  /** Matches client-portal: GROUP/COOPERATIVE use org KYC; SME stays on personal + community. */
  const isOrgKyc = isOrganizationKycClientType(clientType);
  const isPersonKyc = !isOrgKyc;
  const isSmeClient = clientType === 'SME';

  const handleFieldChange = (field: keyof ClientKYCData, value: string | number | null) => {
    setKycData((prev) => ({
      ...prev,
      [field]: normalizeKycFieldValue(field, value),
    }));
  };

  const buildValue = (): StaffClientCreateFormValue => ({
    fullName: fullName.trim(),
    clientType,
    districtId,
    kycData: sanitizeKycPayloadForClientType(
      applyKycFormDefaults({ ...kycData, client_type: clientType }, clientType)
    ),
    localPreviews,
  });

  const validateBasics = (mode: 'draft' | 'finished') => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.name = 'Name is required';
    const phone = kycData.phone_number?.trim();
    if (phone && !/^(\+?\d{7,15})$/.test(phone)) e.phone = 'Invalid phone number';
    const email = kycData.email?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email address';
    if (mode === 'finished' && staffMissingLabels.length > 0) {
      e.kyc = 'Complete all required KYC fields before finishing';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleDraft = async () => {
    if (!validateBasics('draft')) return;
    await onSubmitDraft(buildValue());
  };

  const handleFinished = async () => {
    if (!validateBasics('finished')) {
      if (staffMissingLabels.length > 0) {
        Alert.alert('Incomplete profile', `Please complete: ${staffMissingLabels.join(', ')}`);
      }
      return;
    }
    await onSubmitFinished(buildValue());
  };

  const districtLabel =
    typeof districtId === 'number'
      ? districts.find((d) => d.id === districtId)?.name ?? 'Select district'
      : 'Select district (optional)';

  return (
    <View style={styles.form}>
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <ThemedText style={styles.progressTitle}>Profile completion</ThemedText>
          <ThemedText style={styles.progressPct}>{staffRequiredPercentage}%</ThemedText>
        </View>
        <View style={styles.progressBarTrack}>
          <View
            style={[styles.progressBarFill, { width: `${staffRequiredPercentage}%` }]}
          />
        </View>
        <ThemedText style={styles.progressHint}>
          All fields are optional for draft. Finish requires complete KYC for this client type.
        </ThemedText>
      </View>

      <Section title="Basics">
        <ThemedText style={styles.fieldLabel}>Full name *</ThemedText>
        <TextInput
          style={[styles.input, errors.name && styles.inputError]}
          placeholder="e.g. John Doe or Group name"
          placeholderTextColor="#9ca3af"
          value={fullName}
          onChangeText={(v) => {
            setFullName(v);
            if (errors.name) setErrors((e) => ({ ...e, name: '' }));
          }}
        />
        {errors.name ? <ThemedText style={styles.errorText}>{errors.name}</ThemedText> : null}

        <ThemedText style={styles.fieldLabel}>Client type</ThemedText>
        <View style={styles.typeRow}>
          {CLIENT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, clientType === t.value && styles.typeChipActive]}
              disabled={lockClientType}
              onPress={() => {
                if (lockClientType) return;
                setClientType(t.value);
                setKycData((prev) => applyKycFormDefaults({ ...prev, client_type: t.value }, t.value));
              }}
            >
              <ThemedText
                style={[
                  styles.typeChipText,
                  clientType === t.value && styles.typeChipTextActive,
                ]}
              >
                {t.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {staffBranchId != null ? (
          <>
            <ThemedText style={styles.fieldLabel}>District (optional)</ThemedText>
            <Pressable
              style={styles.select}
              onPress={() => districts.length > 0 && setDistrictPickerOpen(true)}
            >
              <ThemedText style={styles.selectText}>
                {districtsLoading ? 'Loading districts…' : districtLabel}
              </ThemedText>
              {districtsLoading ? (
                <ActivityIndicator size="small" color={CoFiColors.primary} />
              ) : (
                <MaterialIcons name="expand-more" size={22} color="#6b7280" />
              )}
            </Pressable>
          </>
        ) : null}
      </Section>

      {isOrgKyc ? (
        <Section title="Organization information">
          <ThemedText style={styles.help}>
            Group registration details — not personal national ID fields.
          </ThemedText>
          <AuthTextField
            value={kycData.registration_number ?? ''}
            onChangeText={(v) => handleFieldChange('registration_number', v)}
            placeholder="Registration number"
          />
          <AuthTextField
            value={kycData.registration_date ?? ''}
            onChangeText={(v) => handleFieldChange('registration_date', v)}
            placeholder="Registration date (YYYY-MM-DD)"
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
                placeholder="Village head name"
              />
              <AuthTextField
                value={kycData.village_head_phone ?? ''}
                onChangeText={(v) => handleFieldChange('village_head_phone', v)}
                placeholder="Village head phone"
                keyboardType="phone-pad"
              />
            </>
          ) : null}
        </Section>
      ) : (
        <Section title="Identity information">
          <AuthTextField
            value={kycData.national_id ?? ''}
            onChangeText={(v) => handleFieldChange('national_id', v)}
            placeholder="National ID / passport number"
          />
          <AuthTextField
            value={kycData.date_of_birth ?? ''}
            onChangeText={(v) => handleFieldChange('date_of_birth', v)}
            placeholder="Date of birth (YYYY-MM-DD)"
          />
        </Section>
      )}

      <Section title={isOrgKyc ? 'Group contact' : 'Contact'}>
        <AuthTextField
          value={kycData.email ?? ''}
          onChangeText={(v) => handleFieldChange('email', v)}
          placeholder={isOrgKyc ? 'Group email' : 'Email'}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {errors.email ? <ThemedText style={styles.errorText}>{errors.email}</ThemedText> : null}
        <AuthTextField
          value={kycData.phone_number ?? ''}
          onChangeText={(v) => handleFieldChange('phone_number', v)}
          placeholder={isOrgKyc ? 'Group phone number' : 'Phone number'}
          keyboardType="phone-pad"
        />
        {errors.phone ? <ThemedText style={styles.errorText}>{errors.phone}</ThemedText> : null}
        <AuthTextField
          value={kycData.address ?? ''}
          onChangeText={(v) => handleFieldChange('address', v)}
          placeholder={isOrgKyc ? 'Group office / meeting address' : 'Physical address'}
        />
      </Section>

      {isPersonKyc ? (
        <Section title="Personal information">
          <ThemedText style={styles.subLabel}>Gender</ThemedText>
          <ClientChipRow
            options={GENDER_OPTIONS}
            value={(kycData.gender as 'M' | 'F') || 'M'}
            onChange={(v) => handleFieldChange('gender', v)}
          />
          <ThemedText style={styles.subLabel}>Marital status</ThemedText>
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
            placeholder="Occupation"
          />
          <ThemedText style={styles.sectionSubtitle}>Next of kin</ThemedText>
          <AuthTextField
            value={kycData.next_of_kin_name ?? ''}
            onChangeText={(v) => handleFieldChange('next_of_kin_name', v)}
            placeholder="Next of kin name"
          />
          <AuthTextField
            value={kycData.next_of_kin_phone ?? ''}
            onChangeText={(v) => handleFieldChange('next_of_kin_phone', v)}
            placeholder="Next of kin phone"
            keyboardType="phone-pad"
          />
          <AuthTextField
            value={kycData.next_of_kin_relationship ?? ''}
            onChangeText={(v) => handleFieldChange('next_of_kin_relationship', v)}
            placeholder="Relationship"
          />
        </Section>
      ) : null}

      {isSmeClient ? (
        <Section title="Community">
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
                placeholder="Village head name"
              />
              <AuthTextField
                value={kycData.village_head_phone ?? ''}
                onChangeText={(v) => handleFieldChange('village_head_phone', v)}
                placeholder="Village head phone"
                keyboardType="phone-pad"
              />
            </>
          ) : null}
        </Section>
      ) : null}

      {isOrgKyc ? (
        <>
          <Section title="Group leadership">
            <ThemedText style={styles.help}>
              Leaders of this group account — enter each officer’s name and phone.
            </ThemedText>
            <ThemedText style={styles.sectionSubtitle}>Chairperson</ThemedText>
            <AuthTextField
              value={kycData.chairperson_name ?? ''}
              onChangeText={(v) => handleFieldChange('chairperson_name', v)}
              placeholder="Chairperson full name"
            />
            <AuthTextField
              value={kycData.chairperson_phone ?? ''}
              onChangeText={(v) => handleFieldChange('chairperson_phone', v)}
              placeholder="Chairperson phone"
              keyboardType="phone-pad"
            />
            <ThemedText style={styles.sectionSubtitle}>Secretary</ThemedText>
            <AuthTextField
              value={kycData.secretary_name ?? ''}
              onChangeText={(v) => handleFieldChange('secretary_name', v)}
              placeholder="Secretary full name"
            />
            <AuthTextField
              value={kycData.secretary_phone ?? ''}
              onChangeText={(v) => handleFieldChange('secretary_phone', v)}
              placeholder="Secretary phone"
              keyboardType="phone-pad"
            />
            <ThemedText style={styles.sectionSubtitle}>Treasurer</ThemedText>
            <AuthTextField
              value={kycData.treasurer_name ?? ''}
              onChangeText={(v) => handleFieldChange('treasurer_name', v)}
              placeholder="Treasurer full name"
            />
            <AuthTextField
              value={kycData.treasurer_phone ?? ''}
              onChangeText={(v) => handleFieldChange('treasurer_phone', v)}
              placeholder="Treasurer phone"
              keyboardType="phone-pad"
            />
          </Section>
          <Section title="Group details">
            <AuthTextField
              value={kycData.group_purpose ?? ''}
              onChangeText={(v) => handleFieldChange('group_purpose', v)}
              placeholder="Group purpose / objectives"
            />
            <AuthTextField
              value={kycData.meeting_schedule ?? ''}
              onChangeText={(v) => handleFieldChange('meeting_schedule', v)}
              placeholder="Meeting schedule"
            />
            <AuthTextField
              value={kycData.member_count != null ? String(kycData.member_count) : ''}
              onChangeText={(v) =>
                handleFieldChange('member_count', v.trim() ? parseInt(v, 10) || null : null)
              }
              placeholder="Number of members"
              keyboardType="number-pad"
            />
          </Section>
        </>
      ) : null}

      <Section title={isOrgKyc ? 'Organization documents' : 'Identity documents'}>
        {isPersonKyc ? (
          <>
            <ThemedText style={styles.help}>
              Upload a profile photo and both sides of the national ID. Previews appear after each
              pick.
            </ThemedText>
            <StaffKycDocumentField
              label="Profile photo"
              field="profile_photo_path"
              variant="profile"
              serverPath={kycData.profile_photo_path}
              localPreviewUri={localPreviews.profile_photo_path}
              onLocalPick={(uri) => {
                setLocalPreviews((p) => ({ ...p, profile_photo_path: uri }));
                handleFieldChange('profile_photo_path', uri);
              }}
              onClear={() => {
                setLocalPreviews((p) => ({ ...p, profile_photo_path: undefined }));
                handleFieldChange('profile_photo_path', null);
              }}
            />
            <ThemedText style={styles.sectionSubtitle}>National ID — both sides</ThemedText>
            <StaffKycDocumentField
              label="National ID — Front"
              field="id_document_path"
              variant="id"
              serverPath={kycData.id_document_path}
              localPreviewUri={localPreviews.id_document_path}
              onLocalPick={(uri) => {
                setLocalPreviews((p) => ({ ...p, id_document_path: uri }));
                handleFieldChange('id_document_path', uri);
              }}
              onClear={() => {
                setLocalPreviews((p) => ({ ...p, id_document_path: undefined }));
                handleFieldChange('id_document_path', null);
              }}
            />
            <StaffKycDocumentField
              label="National ID — Back"
              field="id_document_back_path"
              variant="id"
              serverPath={kycData.id_document_back_path}
              localPreviewUri={localPreviews.id_document_back_path}
              onLocalPick={(uri) => {
                setLocalPreviews((p) => ({ ...p, id_document_back_path: uri }));
                handleFieldChange('id_document_back_path', uri);
              }}
              onClear={() => {
                setLocalPreviews((p) => ({ ...p, id_document_back_path: undefined }));
                handleFieldChange('id_document_back_path', null);
              }}
            />
          </>
        ) : (
          <>
            <ThemedText style={styles.help}>
              Upload the group constitution and a shared group photo (all members) — not personal
              national ID photos.
            </ThemedText>
            <StaffKycDocumentField
              label="Group constitution document"
              field="group_constitution_path"
              variant="constitution"
              serverPath={kycData.group_constitution_path}
              localPreviewUri={localPreviews.group_constitution_path}
              onLocalPick={(uri) => {
                setLocalPreviews((p) => ({ ...p, group_constitution_path: uri }));
                handleFieldChange('group_constitution_path', uri);
              }}
              onClear={() => {
                setLocalPreviews((p) => ({ ...p, group_constitution_path: undefined }));
                handleFieldChange('group_constitution_path', null);
              }}
            />
            <StaffKycDocumentField
              label="Group photo (all members)"
              field="group_photo_path"
              variant="profile"
              serverPath={kycData.group_photo_path}
              localPreviewUri={localPreviews.group_photo_path}
              onLocalPick={(uri) => {
                setLocalPreviews((p) => ({ ...p, group_photo_path: uri }));
                handleFieldChange('group_photo_path', uri);
              }}
              onClear={() => {
                setLocalPreviews((p) => ({ ...p, group_photo_path: undefined }));
                handleFieldChange('group_photo_path', null);
              }}
            />
          </>
        )}
      </Section>

      <Section title={isOrgKyc ? 'Group finances (optional)' : 'Financial (optional)'}>
        <AuthTextField
          value={kycData.employer ?? ''}
          onChangeText={(v) => handleFieldChange('employer', v)}
          placeholder={isOrgKyc ? 'Organization name' : 'Employer'}
        />
        <MwkMoneyInput
          label={isOrgKyc ? 'Monthly income / revenue' : 'Monthly income'}
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
          placeholder={isOrgKyc ? 'Account name (group)' : 'Account holder name'}
        />
      </Section>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.draftBtn, submitting && styles.btnDisabled]}
          onPress={handleDraft}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={CoFiColors.primary} />
          ) : (
            <MaterialIcons name="save-alt" size={20} color={CoFiColors.primary} />
          )}
          <ThemedText style={styles.draftBtnText}>Save draft</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.finishBtn, submitting && styles.btnDisabled]}
          onPress={handleFinished}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialIcons name="check-circle" size={20} color="#fff" />
          )}
          <ThemedText style={styles.finishBtnText}>Save & finish</ThemedText>
        </TouchableOpacity>
      </View>

      <Modal visible={districtPickerOpen} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setDistrictPickerOpen(false)}>
          <View style={styles.pickerSheet}>
            <ThemedText style={styles.pickerTitle}>Select district</ThemedText>
            <ScrollView>
              {districts.map((d) => (
                <Pressable
                  key={d.id}
                  style={styles.pickerItem}
                  onPress={() => {
                    setDistrictId(d.id);
                    setDistrictPickerOpen(false);
                  }}
                >
                  <ThemedText>{d.name}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingBottom: 32 },
  progressCard: {
    backgroundColor: 'rgba(10,61,122,0.06)',
    borderRadius: Radius.md,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(10,61,122,0.12)',
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },
  progressPct: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: CoFiColors.primary },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(10,61,122,0.12)',
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: CoFiColors.primary, borderRadius: 4 },
  progressHint: { fontFamily: Fonts.sans, fontSize: 12, opacity: 0.7 },
  section: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: Radius.md,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 15, marginBottom: 4 },
  sectionSubtitle: { fontFamily: Fonts.sansSemiBold, fontSize: 13, opacity: 0.7, marginTop: 4 },
  subLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 12, opacity: 0.7 },
  help: { fontFamily: Fonts.sans, fontSize: 12, opacity: 0.65, lineHeight: 17 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6, opacity: 0.8 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: CoFiColors.backgroundCard,
    color: CoFiColors.foreground,
  },
  inputError: { borderColor: '#ef4444' },
  errorText: { color: '#ef4444', fontSize: 12, marginTop: 4 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  typeChipActive: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  typeChipText: { fontSize: 13, fontWeight: '500' },
  typeChipTextActive: { color: '#fff' },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectText: { fontFamily: Fonts.sans, fontSize: 15 },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  draftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    backgroundColor: CoFiColors.backgroundCard,
  },
  draftBtnText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 15 },
  finishBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: CoFiColors.primary,
  },
  finishBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: CoFiColors.backgroundCard,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '50%',
  },
  pickerTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16, marginBottom: 12 },
  pickerItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
});
