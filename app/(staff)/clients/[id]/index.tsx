import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  ClientAccountActionModal,
  type AccountActionSubmitPayload,
  type ClientAccountActionMode,
} from '@/components/client-account-action-modal';
import { CashCollateralBalanceCard } from '@/components/cash-collateral/cash-collateral-balance-card';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { ImageEditModal } from '@/components/image-edit-modal';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { CoFiColors, Radius } from '@/constants/theme';
import {
  USE_API,
  fundStaffClientCashCollateral,
  getApplications,
  getStaffClientAccounts,
  getStaffClientCashCollateralBalance,
  type ApiBankAccount,
} from '@/lib/data';
import type { ApiStaffClientCashCollateralBalance, ApiStaffSavingsAccount } from '@/lib/data/savings-api';
import { cashCollateralRequiredMinor } from '@/lib/cash-collateral-metrics';
import { isGroupParentClient } from '@/lib/group-client';
import { useAuthenticatedImageUri } from '@/lib/media/authenticated-media';
import { openDocumentViewer } from '@/lib/media/open-document-viewer';
import { isPdfPath } from '@/lib/media/resolve-upload-url';
import { isOrganizationKycClientType } from '@/lib/client-portal/kyc-data-normalizer';
import { withUserCapture } from '@/lib/sync/user-activity-lock';
import { canStaffActivateOrVerifyClient } from '@/lib/staff/client-activation';
import { staffClientDocumentsHref, staffClientKycHref } from '@/lib/staff/client-file-links';
import { goToStaffClientParent } from '@/lib/staff/staff-parent-navigation';
import { useAuthStore } from '@/store/auth';
import { useClientsStore } from '@/store/clients';

export default function ClientDetailScreen() {
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const router = useRouter();
  const goToParent = () => {
    if (!id) {
      if (router.canGoBack()) router.back();
      return;
    }
    goToStaffClientParent(router, { clientId: String(id), returnTo });
  };
  const { getClient, updateClient, verifyClient } = useClientsStore();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const mayActivate = canStaffActivateOrVerifyClient(user, hasPermission);

  const [client, setClient] = useState<ReturnType<typeof useClientsStore.getState>['clients'][0] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [occupation, setOccupation] = useState('');
  const [monthlyIncomeMinor, setMonthlyIncomeMinor] = useState<number | null>(null);
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [idDocumentUri, setIdDocumentUri] = useState<string | undefined>();
  const [idDocumentBackUri, setIdDocumentBackUri] = useState<string | undefined>();
  const [groupConstitutionUri, setGroupConstitutionUri] = useState<string | undefined>();
  const [groupPhotoUri, setGroupPhotoUri] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);
  const [editModal, setEditModal] = useState<{ uri: string; type: 'photo' | 'id' } | null>(null);
  const [cashBalance, setCashBalance] = useState<ApiStaffClientCashCollateralBalance | null>(null);
  const [cashLoading, setCashLoading] = useState(true);
  const [cashRequiredMinor, setCashRequiredMinor] = useState<number | null>(null);
  const [staffAccounts, setStaffAccounts] = useState<ApiStaffSavingsAccount[]>([]);
  const [fundMode, setFundMode] = useState<ClientAccountActionMode | null>(null);

  useEffect(() => {
    if (!id) return;
    getClient(id).then((c) => {
      if (c) {
        setClient(c);
        setName(c.name);
        setPhoneNumber(c.phoneNumber ?? '');
        setNationalId(c.nationalId ?? '');
        setEmail(c.email ?? '');
        setAddress(c.address ?? '');
        setOccupation(c.occupation ?? '');
        setMonthlyIncomeMinor(
          typeof c.monthlyIncome === 'number' && c.monthlyIncome > 0 ? c.monthlyIncome : null
        );
        setPhotoUri(c.photoUri);
        setIdDocumentUri(c.idDocumentUri);
        setIdDocumentBackUri(c.idDocumentBackUri);
        setGroupConstitutionUri(c.groupConstitutionUri);
        setGroupPhotoUri(c.groupPhotoUri);
      }
      setLoading(false);
    });
  }, [id, getClient]);

  const loadCashCollateral = useCallback(async () => {
    if (!id) return;
    setCashLoading(true);
    let balance: ApiStaffClientCashCollateralBalance | null = null;
    let required: number | null = null;
    try {
      balance = await getStaffClientCashCollateralBalance(Number(id));
    } catch {
      balance = null;
    }
    try {
      const applications = await getApplications(id);
      required = cashCollateralRequiredMinor(applications);
    } catch {
      required = null;
    }
    setCashBalance(balance);
    setCashRequiredMinor(required);
    setCashLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void loadCashCollateral();
    }, [loadCashCollateral])
  );

  const openFundCollateral = async () => {
    setFundMode('fund_collateral');
    try {
      const list = await getStaffClientAccounts(Number(id));
      setStaffAccounts(Array.isArray(list) ? list : []);
    } catch {
      setStaffAccounts([]);
    }
  };

  const bankAccounts: ApiBankAccount[] = staffAccounts.map((a) => ({
    id: a.id,
    client_id: a.client_id,
    account_number: a.account_number,
    account_type: a.account_type,
    account_category: a.account_category,
    balance: a.balance,
    currency: a.currency || 'MWK',
    status: a.status,
    auto_generated: a.auto_generated,
    effective_balance: a.effective_balance ?? null,
    pending_deposit_amount: a.pending_deposit_amount ?? null,
    pending_deposit_count: a.pending_deposit_count ?? null,
    pending_repayment_amount: a.pending_repayment_amount ?? null,
  }));

  const handleFundSubmit = async (payload: AccountActionSubmitPayload) => {
    const p = payload as { source_account_id: number; amount_minor: number };
    await fundStaffClientCashCollateral(Number(id), p);
    Alert.alert('Submitted', 'Cash collateral funding submitted for operations review.');
    setFundMode(null);
    await loadCashCollateral();
  };

  const { uri: photoDisplayUri } = useAuthenticatedImageUri(photoUri);
  const { uri: idDisplayUri } = useAuthenticatedImageUri(idDocumentUri);
  const { uri: idBackDisplayUri } = useAuthenticatedImageUri(idDocumentBackUri);
  const { uri: constitutionDisplayUri } = useAuthenticatedImageUri(
    isPdfPath(groupConstitutionUri) ? null : groupConstitutionUri
  );
  const { uri: groupPhotoDisplayUri } = useAuthenticatedImageUri(groupPhotoUri);

  const openKycDoc = (uri: string | undefined, name: string, docType: string) => {
    if (!uri) return;
    openDocumentViewer(router, { uri, name, docType });
  };

  const pickImage = async (type: 'photo' | 'id', fromGallery = false) => {
    await withUserCapture(async () => {
      if (!fromGallery) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to capture photos.');
          return;
        }
      }
      try {
        const result = fromGallery
          ? await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: false,
              quality: 0.92,
            })
          : await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: false,
              quality: 0.92,
            });
        if (!result.canceled && result.assets[0]) {
          setEditModal({ uri: result.assets[0].uri, type });
        }
      } catch {
        Alert.alert('Error', 'Could not capture image.');
      }
    });
  };

  const handleSave = async () => {
    if (!id || !name.trim()) {
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    setSaving(true);
    try {
      const isLocalUri = (uri?: string) =>
        !!uri &&
        (uri.startsWith('file://') || uri.startsWith('content://') || uri.startsWith('ph://'));
      const orgClient = isOrganizationKycClientType(client?.clientType);
      await updateClient(id, {
        name: name.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        nationalId: orgClient ? undefined : nationalId.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        occupation: orgClient ? undefined : occupation.trim() || undefined,
        monthlyIncome:
          monthlyIncomeMinor != null && monthlyIncomeMinor > 0 ? monthlyIncomeMinor : undefined,
        // Only re-upload when the officer picked/edited a new local image.
        photoUri: orgClient ? undefined : isLocalUri(photoUri) ? photoUri : undefined,
        idDocumentUri: orgClient
          ? undefined
          : isLocalUri(idDocumentUri)
            ? idDocumentUri
            : undefined,
      });
      Alert.alert('Saved', 'Client details updated successfully.');
      goToParent();
    } catch (e) {
      const msg =
        e instanceof Error && e.message.trim()
          ? e.message
          : 'Failed to save. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !id) {
    return (
      <StaffDetailScreen title="Client" subtitle="Loading…" onBack={goToParent}>
        <View style={styles.placeholder}>
          <ActivityIndicator size="large" color={CoFiColors.primary} />
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </View>
      </StaffDetailScreen>
    );
  }

  if (!client) {
    return (
      <StaffDetailScreen title="Client" subtitle="Not found" onBack={goToParent}>
        <View style={styles.placeholder}>
          <ThemedText>Client not found</ThemedText>
          <TouchableOpacity style={styles.backBtn} onPress={goToParent}>
            <ThemedText style={styles.backBtnText}>Go back</ThemedText>
          </TouchableOpacity>
        </View>
      </StaffDetailScreen>
    );
  }

  const handleVerify = async () => {
    if (!id || client.isVerified) return;
    setVerifying(true);
    try {
      await verifyClient(id);
      setClient((c) => (c ? { ...c, isVerified: true } : c));
      Alert.alert('Success', 'Client verified and approved.');
    } catch (e) {
      const msg =
        e instanceof Error && e.message.trim()
          ? e.message
          : 'Failed to verify client. Please try again.';
      Alert.alert('Verification failed', msg);
    } finally {
      setVerifying(false);
    }
  };

  const canVerify = mayActivate && client.isVerified === false;
  const isOrgKyc = isOrganizationKycClientType(client.clientType);
  const showGroupHub =
    USE_API &&
    isGroupParentClient({
      client_type: client.clientType,
      parent_client_id: client.parentClientId ?? null,
    });

  return (
    <>
    <StaffDetailScreen
      title={client.name}
      subtitle={client.customerNumber ?? client.phoneNumber ?? 'Client profile'}
      scroll
      onBack={goToParent}
    >
          {showGroupHub && (
            <View style={styles.groupCard}>
              <ThemedText style={styles.sectionLabel}>Group</ThemedText>
              <ThemedText style={styles.groupHint}>
                Add members before originating a group loan on this borrower. Assign leaders for chairperson and delegated
                access.
              </ThemedText>
              <TouchableOpacity
                style={styles.groupLink}
                onPress={() => router.push(`/(staff)/clients/${id}/members`)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="groups" size={22} color={CoFiColors.primary} />
                <View style={styles.groupLinkText}>
                  <ThemedText type="defaultSemiBold">Members</ThemedText>
                  <ThemedText style={styles.groupLinkSub}>
                    {client.memberCount != null ? `${client.memberCount} on record` : 'List and add members'}
                  </ThemedText>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.groupLink}
                onPress={() => router.push(`/(staff)/clients/${id}/leaders`)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="admin-panel-settings" size={22} color={CoFiColors.primary} />
                <View style={styles.groupLinkText}>
                  <ThemedText type="defaultSemiBold">Leaders</ThemedText>
                  <ThemedText style={styles.groupLinkSub}>Chairperson, secretary, treasurer</ThemedText>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
              </TouchableOpacity>
            </View>
          )}

          {/* Client management links */}
          <View style={styles.quickLinksCard}>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push(staffClientKycHref(id))}
              activeOpacity={0.7}
            >
              <MaterialIcons name="badge" size={22} color={CoFiColors.primary} />
              <View style={styles.quickLinkText}>
                <ThemedText type="defaultSemiBold">Edit KYC</ThemedText>
                <ThemedText style={styles.quickLinkSub}>
                  Update identity, contact, documents — Save draft or Finish profile
                </ThemedText>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push(`/(staff)/clients/${id}/accounts`)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="account-balance-wallet" size={22} color={CoFiColors.primary} />
              <View style={styles.quickLinkText}>
                <ThemedText type="defaultSemiBold">Accounts</ThemedText>
                <ThemedText style={styles.quickLinkSub}>
                  Savings, repayment holding & collateral balances
                </ThemedText>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push(staffClientDocumentsHref(id))}
              activeOpacity={0.7}
            >
              <MaterialIcons name="description" size={22} color={CoFiColors.primary} />
              <View style={styles.quickLinkText}>
                <ThemedText type="defaultSemiBold">Documents</ThemedText>
                <ThemedText style={styles.quickLinkSub}>Uploaded client documents</ThemedText>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push(`/(staff)/clients/${id}/guarantors`)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="verified-user" size={22} color={CoFiColors.primary} />
              <View style={styles.quickLinkText}>
                <ThemedText type="defaultSemiBold">Guarantors</ThemedText>
                <ThemedText style={styles.quickLinkSub}>
                  Client-linked guarantors for loan applications
                </ThemedText>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push(`/(staff)/clients/${id}/collateral-vault`)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="lock" size={22} color={CoFiColors.primary} />
              <View style={styles.quickLinkText}>
                <ThemedText type="defaultSemiBold">Collateral Vault</ThemedText>
                <ThemedText style={styles.quickLinkSub}>Client&apos;s collateral assets</ThemedText>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={CoFiColors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Cash collateral (balance + fund — mirror dashboard ClientOverviewContent) */}
          <View style={styles.cashCollateralSection}>
            <CashCollateralBalanceCard
              balance={cashBalance}
              loading={cashLoading}
              requiredMinor={cashRequiredMinor}
              onFund={() => void openFundCollateral()}
              onOpenAccounts={() => router.push(`/(staff)/clients/${id}/accounts`)}
              emptyHint="No cash collateral account yet — create missing accounts from Accounts to provision the standard set."
            />
          </View>

          {/* KYC documents (shared across LO / CIO / compliance) */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>KYC documents</ThemedText>
            <ThemedText style={styles.kycHint}>
              {isOrgKyc
                ? 'Group constitution and group photo uploaded by the client or staff. Personal national ID fields do not apply to group accounts. Use Edit KYC to update them.'
                : 'Profile photo: tap the photo to update it. ID and constitution: tap to preview.'}
            </ThemedText>

            {!isOrgKyc ? (
              <>
                <ThemedText style={styles.subLabel}>Client photo</ThemedText>
                <View style={styles.photoRow}>
                  <TouchableOpacity
                    style={styles.photoBox}
                    onPress={() => pickImage('photo')}
                    onLongPress={() => {
                      const uri = photoDisplayUri || photoUri;
                      if (uri) openKycDoc(uri, 'profile-photo.jpg', 'PROFILE_PHOTO');
                    }}
                    activeOpacity={0.7}
                  >
                    {photoDisplayUri || photoUri ? (
                      <Image
                        source={{ uri: photoDisplayUri || photoUri! }}
                        style={styles.photoImage}
                      />
                    ) : (
                      <>
                        <MaterialIcons name="add-a-photo" size={40} color={CoFiColors.mutedForeground} />
                        <ThemedText style={styles.photoHint}>Tap to capture</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                  <View style={styles.pickOptionsRow}>
                    <TouchableOpacity style={styles.pickOptionBtn} onPress={() => pickImage('photo')}>
                      <MaterialIcons name="camera-alt" size={16} color={CoFiColors.primary} />
                      <ThemedText style={styles.pickOptionText}>Camera</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.pickOptionBtn} onPress={() => pickImage('photo', true)}>
                      <MaterialIcons name="photo-library" size={16} color={CoFiColors.primary} />
                      <ThemedText style={styles.pickOptionText}>Gallery</ThemedText>
                    </TouchableOpacity>
                  </View>
                  {photoDisplayUri || photoUri ? (
                    <TouchableOpacity
                      style={styles.editOverlayBtn}
                      onPress={() =>
                        setEditModal({ uri: photoDisplayUri || photoUri!, type: 'photo' })
                      }
                    >
                      <MaterialIcons name="edit" size={18} color="#fff" />
                      <ThemedText style={styles.editOverlayText}>Edit</ThemedText>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <ThemedText style={[styles.subLabel, { marginTop: 16 }]}>ID document (front)</ThemedText>
                <View style={styles.idRow}>
                  <TouchableOpacity
                    style={styles.idBox}
                    onPress={() =>
                      idDisplayUri || idDocumentUri
                        ? openKycDoc(idDisplayUri || idDocumentUri, 'id-front.jpg', 'ID_FRONT')
                        : pickImage('id')
                    }
                    activeOpacity={0.7}
                  >
                    {idDisplayUri || idDocumentUri ? (
                      <Image
                        source={{ uri: idDisplayUri || idDocumentUri! }}
                        style={styles.idImage}
                      />
                    ) : (
                      <>
                        <MaterialIcons name="badge" size={40} color={CoFiColors.mutedForeground} />
                        <ThemedText style={styles.photoHint}>Tap to capture or upload</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                  <View style={styles.pickOptionsRow}>
                    <TouchableOpacity style={styles.pickOptionBtn} onPress={() => pickImage('id')}>
                      <MaterialIcons name="camera-alt" size={16} color={CoFiColors.primary} />
                      <ThemedText style={styles.pickOptionText}>Camera</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.pickOptionBtn} onPress={() => pickImage('id', true)}>
                      <MaterialIcons name="photo-library" size={16} color={CoFiColors.primary} />
                      <ThemedText style={styles.pickOptionText}>Gallery</ThemedText>
                    </TouchableOpacity>
                  </View>
                  {idDisplayUri || idDocumentUri ? (
                    <TouchableOpacity
                      style={styles.editOverlayBtnId}
                      onPress={() =>
                        setEditModal({ uri: idDisplayUri || idDocumentUri!, type: 'id' })
                      }
                    >
                      <MaterialIcons name="edit" size={18} color="#fff" />
                      <ThemedText style={styles.editOverlayText}>Edit</ThemedText>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {idDocumentBackUri ? (
                  <>
                    <ThemedText style={[styles.subLabel, { marginTop: 16 }]}>ID document (back)</ThemedText>
                    <TouchableOpacity
                      style={styles.idBox}
                      onPress={() =>
                        openKycDoc(idBackDisplayUri || idDocumentBackUri, 'id-back.jpg', 'ID_BACK')
                      }
                      activeOpacity={0.7}
                    >
                      {idBackDisplayUri ? (
                        <Image source={{ uri: idBackDisplayUri }} style={styles.idImage} />
                      ) : (
                        <>
                          <MaterialIcons name="badge" size={40} color={CoFiColors.primary} />
                          <ThemedText style={styles.photoHint}>Tap to preview</ThemedText>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                ) : null}
              </>
            ) : null}

            {groupConstitutionUri || groupPhotoUri || isOrgKyc ? (
              <>
                <ThemedText style={[styles.subLabel, { marginTop: isOrgKyc ? 0 : 16 }]}>
                  Group constitution
                </ThemedText>
                {groupConstitutionUri ? (
                  <TouchableOpacity
                    style={styles.constitutionBox}
                    onPress={() =>
                      openKycDoc(
                        constitutionDisplayUri || groupConstitutionUri,
                        groupConstitutionUri.split('/').pop() ?? 'constitution.pdf',
                        'GROUP_CONSTITUTION'
                      )
                    }
                    activeOpacity={0.7}
                  >
                    {constitutionDisplayUri && !isPdfPath(groupConstitutionUri) ? (
                      <Image source={{ uri: constitutionDisplayUri }} style={styles.idImage} />
                    ) : (
                      <>
                        <MaterialIcons name="picture-as-pdf" size={36} color={CoFiColors.primary} />
                        <ThemedText style={styles.photoHint}>Tap to open constitution</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <ThemedText style={styles.photoHint}>No constitution uploaded yet.</ThemedText>
                )}

                <ThemedText style={[styles.subLabel, { marginTop: 16 }]}>
                  Group photo (all members)
                </ThemedText>
                {groupPhotoUri ? (
                  <TouchableOpacity
                    style={styles.constitutionBox}
                    onPress={() =>
                      openKycDoc(
                        groupPhotoDisplayUri || groupPhotoUri,
                        groupPhotoUri.split('/').pop() ?? 'group-photo.jpg',
                        'GROUP_PHOTO'
                      )
                    }
                    activeOpacity={0.7}
                  >
                    {groupPhotoDisplayUri ? (
                      <Image source={{ uri: groupPhotoDisplayUri }} style={styles.idImage} />
                    ) : (
                      <>
                        <MaterialIcons name="groups" size={36} color={CoFiColors.primary} />
                        <ThemedText style={styles.photoHint}>Tap to preview group photo</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <ThemedText style={styles.photoHint}>No group photo uploaded yet.</ThemedText>
                )}
              </>
            ) : null}
          </View>

          {/* Verify / Approve */}
          {canVerify && (
            <View style={styles.section}>
              <View style={styles.statusRow}>
                <View style={styles.badgeUnverified}>
                  <ThemedText style={styles.badgeUnverifiedText}>Unverified</ThemedText>
                </View>
                <TouchableOpacity
                  style={styles.verifyBtn}
                  onPress={handleVerify}
                  disabled={verifying}
                  activeOpacity={0.7}
                >
                  {verifying ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="verified-user" size={20} color="#fff" />
                      <ThemedText style={styles.verifyBtnText}>Activate / Verify account</ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Form fields */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>
              {isOrgKyc ? 'Group information' : 'Personal information'}
            </ThemedText>
            <ThemedText style={styles.label}>{isOrgKyc ? 'Group name *' : 'Full name *'}</ThemedText>
            <TextInput style={styles.input} placeholder={isOrgKyc ? 'Group name' : 'Full name'} placeholderTextColor="#9ca3af" value={name} onChangeText={setName} />
            <ThemedText style={styles.label}>Phone number</ThemedText>
            <TextInput style={styles.input} placeholder="+265..." placeholderTextColor="#9ca3af" value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" />
            {!isOrgKyc ? (
              <>
                <ThemedText style={styles.label}>National ID</ThemedText>
                <TextInput style={styles.input} placeholder="ID number" placeholderTextColor="#9ca3af" value={nationalId} onChangeText={setNationalId} />
              </>
            ) : null}
            <ThemedText style={styles.label}>Email</ThemedText>
            <TextInput style={styles.input} placeholder="email@example.com" placeholderTextColor="#9ca3af" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <ThemedText style={styles.label}>Address</ThemedText>
            <TextInput style={styles.input} placeholder="Full address" placeholderTextColor="#9ca3af" value={address} onChangeText={setAddress} />
            {!isOrgKyc ? (
              <>
                <ThemedText style={styles.label}>Occupation</ThemedText>
                <TextInput style={styles.input} placeholder="e.g. Teacher, Farmer" placeholderTextColor="#9ca3af" value={occupation} onChangeText={setOccupation} />
              </>
            ) : null}
            <MwkMoneyInput
              label={isOrgKyc ? 'Monthly income / revenue' : 'Monthly income'}
              valueMinor={monthlyIncomeMinor}
              onChangeMinor={setMonthlyIncomeMinor}
              placeholder="MWK 0"
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.7}>
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <MaterialIcons name="save" size={22} color="#fff" />
                <ThemedText style={styles.saveBtnText}>Save changes</ThemedText>
              </>
            )}
          </TouchableOpacity>
          <View style={{ height: 48 }} />
    </StaffDetailScreen>

    {editModal ? (
      <ImageEditModal
        visible={!!editModal}
        imageUri={editModal.uri}
        onClose={() => setEditModal(null)}
        onSave={(uri) => {
          if (editModal.type === 'photo') setPhotoUri(uri);
          else setIdDocumentUri(uri);
          setEditModal(null);
        }}
        aspectRatio={editModal.type === 'photo' ? 1 : 4 / 3}
      />
    ) : null}

    <ClientAccountActionModal
      visible={fundMode === 'fund_collateral'}
      mode={fundMode ?? 'deposit'}
      accounts={bankAccounts}
      requireDepositReceipt={false}
      onClose={() => setFundMode(null)}
      onSubmit={handleFundSubmit}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboard: { flex: 1 },
  scroll: { padding: 20 },
  section: { marginBottom: 24 },
  cashCollateralSection: { marginBottom: 24 },
  sectionLabel: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  subLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, opacity: 0.85 },
  kycHint: { fontSize: 13, opacity: 0.7, marginBottom: 12, lineHeight: 18 },
  constitutionBox: {
    height: 120,
    borderRadius: Radius.lg,
    backgroundColor: CoFiColors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CoFiColors.border,
    gap: 6,
  },
  groupCard: {
    marginBottom: 24,
    padding: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    backgroundColor: 'rgba(10,61,122,0.04)',
  },
  groupHint: { fontSize: 13, opacity: 0.8, marginBottom: 12, lineHeight: 18 },
  groupLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: CoFiColors.border,
    gap: 12,
  },
  groupLinkText: { flex: 1 },
  groupLinkSub: { fontSize: 12, opacity: 0.65, marginTop: 2 },
  quickLinksCard: { marginBottom: 24, padding: 16, borderRadius: Radius.lg, borderWidth: 1, borderColor: CoFiColors.border, backgroundColor: CoFiColors.backgroundCard },
  quickLink: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: CoFiColors.border, gap: 12 },
  quickLinkText: { flex: 1 },
  quickLinkSub: { fontSize: 12, opacity: 0.65, marginTop: 2 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  photoRow: { position: 'relative', alignSelf: 'flex-start' },
  photoBox: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: CoFiColors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: CoFiColors.border,
  },
  photoImage: { width: 120, height: 120, borderRadius: 60 },
  editOverlayBtn: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editOverlayText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  pickOptionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pickOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  pickOptionText: { fontSize: 13, color: CoFiColors.primary, fontWeight: '600' },
  photoHint: { marginTop: 8, fontSize: 12, opacity: 0.7 },
  idRow: { position: 'relative', alignSelf: 'flex-start' },
  idBox: {
    height: 140,
    width: 200,
    borderRadius: Radius.lg,
    backgroundColor: CoFiColors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: CoFiColors.border,
  },
  idImage: { width: 200, height: 140, borderRadius: Radius.lg },
  editOverlayBtnId: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    marginTop: 24,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { marginTop: 12 },
  backBtn: { marginTop: 16, padding: 12 },
  backBtnText: { color: CoFiColors.primary, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  badgeUnverified: { backgroundColor: 'rgba(234,179,8,0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  badgeUnverifiedText: { fontSize: 13, color: '#ca8a04', fontWeight: '600' },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
  },
  verifyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
