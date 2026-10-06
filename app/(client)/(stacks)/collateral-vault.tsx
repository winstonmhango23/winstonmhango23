import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
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

import {
  ClientAccountActionModal,
  type AccountActionSubmitPayload,
  type ClientAccountActionMode,
} from '@/components/client-account-action-modal';
import { CollateralPropertyCaptureFields } from '@/components/collateral-property-capture-fields';
import { CollateralPropertyCard } from '@/components/collateral-property-card';
import { ClientHeader } from '@/components/client-ui';
import { type PickedDocument } from '@/components/ui/document-upload-field';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Radius } from '@/constants/theme';
import {
  collateralShortfallMinor,
  cashCollateralRequiredMinor,
} from '@/lib/cash-collateral-metrics';
import { collateralOptionsForContext, collateralTypeLabel, validateCollateralPropertyCapture } from '@/lib/collateral-catalog';
import { navigateBackToProfile } from '@/lib/client-portal/profile-navigation';
import {
  mergeCollateralPortfolio,
  toPortfolioApplicationRef,
  type CollateralWithApplication,
} from '@/lib/client-portal/security-portfolio';
import {
  addBorrowerCollateralVaultItem,
  fundClientCollateral,
  getBorrowerApplicationCollateral,
  getBorrowerCollateralVault,
  setBorrowerVaultCollateralLocation,
} from '@/lib/data';
import type { ApiCollateral } from '@/lib/data';
import {
  apiGetMobileAccounts,
  apiGetMobileCollateralBalance,
  apiGetMobileCollateralLocks,
  type ApiBankAccount,
  type ApiCollateralBalance,
  type ApiCollateralLoanLockSummary,
} from '@/lib/data/accounts-api';
import { isAgriculturalProduct } from '@/lib/loan-product-context';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { propertyDetailHref } from '@/lib/property-detail-routing';
import { getStoredAuth } from '@/lib/storage';
import { useApplicationsStore } from '@/store';

export default function ClientCollateralVaultScreen() {
  const router = useRouter();
  const fetchApplications = useApplicationsStore((s) => s.fetchApplications);
  const applications = useApplicationsStore((s) => s.applications);

  const [vaultItems, setVaultItems] = useState<ApiCollateral[]>([]);
  const [pledgedRows, setPledgedRows] = useState<CollateralWithApplication[]>([]);
  const [cashBalance, setCashBalance] = useState<ApiCollateralBalance | null>(null);
  const [cashLocks, setCashLocks] = useState<ApiCollateralLoanLockSummary[]>([]);
  const [accounts, setAccounts] = useState<ApiBankAccount[]>([]);
  const [actionMode, setActionMode] = useState<ClientAccountActionMode | null>(null);
  const [funding, setFunding] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [collateralType, setCollateralType] = useState('REAL_ESTATE');
  const [collateralOtherLabel, setCollateralOtherLabel] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedValueMinor, setEstimatedValueMinor] = useState<number | null>(null);
  const [regNumber, setRegNumber] = useState('');
  const [collateralLocation, setCollateralLocation] = useState<
    import('@/lib/data/geolocation-types').GeolocationInput | null
  >(null);
  const [collateralDocuments, setCollateralDocuments] = useState<PickedDocument[]>([]);

  const collateralOptions = useMemo(
    () =>
      collateralOptionsForContext({
        isAgricultural: isAgriculturalProduct(undefined),
        isGroupBorrower: false,
      }),
    []
  );

  const activeLocks = useMemo(
    () => cashLocks.filter((s) => (s.lock_count ?? 0) > 0),
    [cashLocks]
  );

  const cashRequiredMinor = useMemo(
    () => cashCollateralRequiredMinor(applications),
    [applications]
  );

  const handleFundSubmit = async (payload: AccountActionSubmitPayload) => {
    const p = payload as { source_account_id: number; amount_minor: number };
    setFunding(true);
    try {
      const result = await fundClientCollateral(p);
      setActionMode(null);
      await loadHub();
      Alert.alert(
        'Submitted',
        result?.message ?? 'Cash collateral funding submitted for staff review.'
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not fund collateral.');
    } finally {
      setFunding(false);
    }
  };

  const loadHub = useCallback(async () => {
    setLoading(true);
    try {
      await fetchApplications();
      const apps = useApplicationsStore.getState().applications;
      const refs = apps
        .map((app) => toPortfolioApplicationRef(app))
        .filter((a): a is NonNullable<typeof a> => a != null);

      const [vault, auth] = await Promise.all([
        getBorrowerCollateralVault(),
        getStoredAuth(),
      ]);
      setVaultItems(vault);

      const errors: string[] = [];
      const perApplication = await Promise.all(
        refs.map(async (ref) => {
          try {
            const rows = await getBorrowerApplicationCollateral(ref.id);
            return { ref, rows };
          } catch (e) {
            errors.push(
              `${ref.application_number}: ${e instanceof Error ? e.message : 'failed'}`
            );
            return { ref, rows: [] as ApiCollateral[] };
          }
        })
      );
      const merged = mergeCollateralPortfolio({ vault, perApplication });
      setPledgedRows(merged.filter((r) => !r.is_vault));
      setLoadErrors(errors);

      if (auth?.token) {
        try {
          const [balance, locks, accountList] = await Promise.all([
            apiGetMobileCollateralBalance(auth.token),
            apiGetMobileCollateralLocks(auth.token),
            apiGetMobileAccounts(auth.token),
          ]);
          setCashBalance(balance);
          setCashLocks(Array.isArray(locks) ? locks : []);
          setAccounts(Array.isArray(accountList) ? accountList : []);
        } catch {
          setCashBalance(null);
          setCashLocks([]);
          setAccounts([]);
        }
      }
    } catch {
      setVaultItems([]);
      setPledgedRows([]);
    } finally {
      setLoading(false);
    }
  }, [fetchApplications]);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const resetForm = () => {
    setDescription('');
    setEstimatedValueMinor(null);
    setRegNumber('');
    setCollateralOtherLabel('');
    setCollateralLocation(null);
    setCollateralDocuments([]);
    setCollateralType('REAL_ESTATE');
  };

  const handleAdd = async () => {
    if (!description.trim() || estimatedValueMinor == null || estimatedValueMinor <= 0) {
      Alert.alert('Required', 'Enter description and estimated MWK value.');
      return;
    }
    const propertyErr = validateCollateralPropertyCapture({
      collateralType,
      otherTypeLabel: collateralOtherLabel,
      geolocation: collateralLocation,
      documents: collateralDocuments,
    });
    if (propertyErr) {
      Alert.alert('Property collateral', propertyErr);
      return;
    }
    setSubmitting(true);
    try {
      await addBorrowerCollateralVaultItem({
        collateral_type: collateralType,
        description: description.trim(),
        estimated_value: estimatedValueMinor,
        other_type_label: collateralType === 'OTHER' ? collateralOtherLabel.trim() : undefined,
        registration_number: regNumber.trim() || undefined,
        geolocation: collateralLocation ?? undefined,
        documents:
          collateralDocuments.length > 0
            ? collateralDocuments.map((d) => ({ uri: d.uri, name: d.name, docType: d.docType }))
            : undefined,
      });
      await loadHub();
      setShowForm(false);
      resetForm();
      Alert.alert('Saved', 'Your property collateral has been recorded with GPS location.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save collateral.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <ClientHeader
        title="My collateral"
        subtitle="Cash, property vault & pledges"
        showBack
        onBack={() => navigateBackToProfile(router)}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadHub()} />}
      >
        <ThemedText style={styles.intro}>
          Manage cash collateral, geotagged property in your vault, and items already pledged on loan
          requests — matching the client portal collateral hub.
        </ThemedText>

        {loadErrors.length > 0 ? (
          <ThemedText style={styles.warn}>
            Some applications could not load: {loadErrors.join('; ')}
          </ThemedText>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="account-balance-wallet" size={20} color={ClientUI.colors.primary} />
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Cash collateral
            </ThemedText>
          </View>
          {cashBalance?.account_id ? (
            <>
              <ThemedText style={styles.meta}>
                {cashBalance.account_number ?? 'Collateral account'}
              </ThemedText>
              <View style={styles.balanceRow}>
                <View style={styles.balanceCell}>
                  <ThemedText style={styles.meta}>Total</ThemedText>
                  <ThemedText type="defaultSemiBold">
                    {formatMinorMWK(cashBalance.total_balance)}
                  </ThemedText>
                </View>
                <View style={styles.balanceCell}>
                  <ThemedText style={styles.meta}>Locked</ThemedText>
                  <ThemedText type="defaultSemiBold">
                    {formatMinorMWK(cashBalance.locked_balance)}
                  </ThemedText>
                </View>
                <View style={styles.balanceCell}>
                  <ThemedText style={styles.meta}>Available</ThemedText>
                  <ThemedText type="defaultSemiBold">
                    {formatMinorMWK(cashBalance.available_balance)}
                  </ThemedText>
                </View>
              </View>
              {activeLocks.length > 0 ? (
                <ThemedText style={styles.meta}>
                  {activeLocks.length} active loan lock{activeLocks.length === 1 ? '' : 's'}
                </ThemedText>
              ) : null}
            </>
          ) : (
            <ThemedText style={styles.meta}>
              Cash collateral balance is managed from Accounts once your collateral account exists.
            </ThemedText>
          )}

          {cashRequiredMinor > 0 ? (
            (() => {
              const available = cashBalance?.available_balance ?? 0;
              const shortfall = collateralShortfallMinor(cashRequiredMinor, available);
              const covered = shortfall === 0;
              return (
                <View
                  style={[
                    styles.requirementBox,
                    covered ? styles.requirementOk : styles.requirementWarn,
                  ]}
                >
                  <MaterialIcons
                    name={covered ? 'check-circle' : 'warning'}
                    size={16}
                    color={covered ? '#15803d' : '#b45309'}
                  />
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={[
                        styles.requirementTitle,
                        { color: covered ? '#15803d' : '#b45309' },
                      ]}
                    >
                      {covered
                        ? 'Collateral commitment covered'
                        : `Top up ${formatMinorMWK(shortfall)} to meet your 15% commitment`}
                    </ThemedText>
                    <ThemedText style={styles.meta}>
                      15% of active loan requests: {formatMinorMWK(cashRequiredMinor)} required ·{' '}
                      {formatMinorMWK(available)} available
                    </ThemedText>
                  </View>
                </View>
              );
            })()
          ) : null}

          <View style={styles.fundRow}>
            <Pressable
              style={styles.fundBtn}
              onPress={() => setActionMode('fund_collateral')}
              disabled={accounts.length === 0 || funding}
            >
              <MaterialIcons name="lock" size={16} color="#fff" />
              <ThemedText style={styles.fundBtnText}>
                {funding ? 'Submitting…' : 'Fund collateral from savings'}
              </ThemedText>
            </Pressable>
            <Pressable
              style={styles.linkBtn}
              onPress={() => router.push('/(client)/accounts' as Href)}
            >
              <ThemedText style={styles.linkBtnText}>Accounts</ThemedText>
              <MaterialIcons name="chevron-right" size={18} color={ClientUI.colors.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <ThemedText type="defaultSemiBold" style={styles.listHeading}>
            Property vault ({vaultItems.length})
          </ThemedText>
        </View>
        <ThemedText style={styles.meta}>
          Save land, shops, and buildings with GPS and photos for future loan requests.
        </ThemedText>

        <Pressable style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
          <MaterialIcons name={showForm ? 'expand-less' : 'add-location-alt'} size={20} color="#fff" />
          <ThemedText style={styles.addBtnText}>
            {showForm ? 'Hide form' : 'Add property collateral'}
          </ThemedText>
        </Pressable>

        {showForm ? (
          <View style={styles.form}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {collateralOptions.map((t) => (
                <Pressable
                  key={t.value}
                  onPress={() => setCollateralType(t.value)}
                  style={[styles.chip, collateralType === t.value && styles.chipActive]}
                >
                  <ThemedText style={[styles.chipText, collateralType === t.value && styles.chipTextActive]}>
                    {t.label}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
            {collateralType === 'OTHER' ? (
              <TextInput
                style={styles.input}
                placeholder="Specify type (e.g. land, shop)"
                placeholderTextColor={ClientUI.colors.textMuted}
                value={collateralOtherLabel}
                onChangeText={setCollateralOtherLabel}
              />
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Description *"
              placeholderTextColor={ClientUI.colors.textMuted}
              value={description}
              onChangeText={setDescription}
            />
            <MwkMoneyInput
              label="Estimated value"
              valueMinor={estimatedValueMinor}
              onChangeMinor={setEstimatedValueMinor}
              placeholder="MWK 0"
              required
            />
            <TextInput
              style={styles.input}
              placeholder="Title / registration number (optional)"
              placeholderTextColor={ClientUI.colors.textMuted}
              value={regNumber}
              onChangeText={setRegNumber}
            />
            <CollateralPropertyCaptureFields
              collateralType={collateralType}
              otherTypeLabel={collateralOtherLabel}
              location={collateralLocation}
              onLocationChange={setCollateralLocation}
              documents={collateralDocuments}
              onDocumentsChange={setCollateralDocuments}
              disabled={submitting}
            />
            <Pressable style={styles.saveBtn} onPress={() => void handleAdd()} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.saveBtnText}>Save property</ThemedText>
              )}
            </Pressable>
          </View>
        ) : null}

        {vaultItems.map((item) => (
          <CollateralPropertyCard
            key={item.id}
            item={item}
            detailHref={propertyDetailHref(item.id, { kind: 'borrower-vault' }, 'client')}
            onUpdateLocation={async (location) => {
              await setBorrowerVaultCollateralLocation(item.id, location);
              await loadHub();
            }}
          />
        ))}
        {!loading && vaultItems.length === 0 ? (
          <ThemedText style={styles.empty}>No property collateral saved yet.</ThemedText>
        ) : null}

        <ThemedText type="defaultSemiBold" style={[styles.listHeading, { marginTop: 16 }]}>
          Pledged on loan requests ({pledgedRows.length})
        </ThemedText>
        {pledgedRows.map((row) => (
          <View key={`p-${row.id}-${row.application.id}`} style={styles.pledgeCard}>
            <ThemedText type="defaultSemiBold">
              {collateralTypeLabel(row.collateral_type, row.other_type_label)}
            </ThemedText>
            <ThemedText style={styles.meta}>{row.description}</ThemedText>
            <ThemedText style={styles.meta}>
              {row.application.application_number}
              {row.application.product_name ? ` · ${row.application.product_name}` : ''}
            </ThemedText>
            {row.estimated_value != null ? (
              <ThemedText style={styles.meta}>
                Value: {formatMinorMWK(row.estimated_value)}
              </ThemedText>
            ) : null}
          </View>
        ))}
        {!loading && pledgedRows.length === 0 ? (
          <ThemedText style={styles.empty}>No collateral pledged on applications yet.</ThemedText>
        ) : null}
      </ScrollView>

      <ClientAccountActionModal
        visible={actionMode === 'fund_collateral'}
        mode={actionMode ?? 'deposit'}
        accounts={accounts}
        onClose={() => setActionMode(null)}
        onSubmit={handleFundSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  list: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 13, lineHeight: 19, color: ClientUI.colors.textMuted, marginBottom: 14 },
  section: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    marginBottom: 16,
    gap: 8,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeaderRow: { marginBottom: 4 },
  sectionTitle: { fontSize: 15 },
  listHeading: { fontSize: 15, marginBottom: 6 },
  balanceRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  balanceCell: { flex: 1, gap: 2 },
  meta: { fontSize: 12, color: ClientUI.colors.textMuted, lineHeight: 17 },
  linkBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  linkBtnText: { color: ClientUI.colors.primary, fontWeight: '600', fontSize: 13 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.primary,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    marginVertical: 12,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  form: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    marginBottom: 8,
  },
  chips: { gap: 8, paddingBottom: 4 },
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
  },
  saveBtn: {
    backgroundColor: ClientUI.colors.primary,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', paddingVertical: 20, opacity: 0.55 },
  warn: { color: ClientUI.colors.textMuted, marginBottom: 10, fontSize: 12 },
  requirementBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.md,
    padding: 10,
    borderWidth: 1,
  },
  requirementOk: {
    backgroundColor: 'rgba(21,128,61,0.1)',
    borderColor: 'rgba(21,128,61,0.35)',
  },
  requirementWarn: {
    backgroundColor: 'rgba(180,83,9,0.1)',
    borderColor: 'rgba(180,83,9,0.35)',
  },
  requirementTitle: { fontSize: 12, fontWeight: '600' },
  fundRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  fundBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ClientUI.colors.primary,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  fundBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  pledgeCard: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    marginBottom: 10,
    gap: 4,
  },
});
