import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView,
  StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StaffDetailScreen } from '@/components/staff-ui';
import { CollateralPropertyCaptureFields } from '@/components/collateral-property-capture-fields';
import { CollateralPropertyCard } from '@/components/collateral-property-card';
import { type PickedDocument } from '@/components/ui/document-upload-field';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { useLoansStore } from '@/store/loans';
import {
  addLoanCollateral,
  getLoanCollateral,
  getLoanProducts,
  getLoanProductsLocal,
  refreshLoanProducts,
  setLoanCollateralLocation,
} from '@/lib/data';
import type { ApiCollateral, LoanProductRow } from '@/lib/data';
import {
  collateralOptionsForContext,
  collateralShowsPropertyCapture,
  defaultCollateralType,
  validateCollateralPropertyCapture,
} from '@/lib/collateral-catalog';
import { defaultDescriptionForCollateralType } from '@/lib/group-member-cash-collateral';
import { propertyDetailHref } from '@/lib/property-detail-routing';
import { isAgriculturalProduct } from '@/lib/loan-product-context';
import { getClient, USE_API } from '@/lib/data';
import { isGroupParentClient } from '@/lib/group-client';
import {
  isLoanSecurityLocked,
  loanSecurityLockMessage,
} from '@/lib/loan-origination/security-lock';

export default function LoanCollateralScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loan = useLoansStore((s) => s.loans.find((l) => String(l.id) === id));
  const securityLocked = isLoanSecurityLocked(loan?.status);

  const [collaterals, setCollaterals] = useState<ApiCollateral[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [borrowerIsGroupParent, setBorrowerIsGroupParent] = useState(false);
  const [productRows, setProductRows] = useState<LoanProductRow[]>([]);

  const [collateralType, setCollateralType] = useState('REAL_ESTATE');
  const [collateralOtherLabel, setCollateralOtherLabel] = useState('');
  const [collateralDesc, setCollateralDesc] = useState('');
  const [collateralValueMinor, setCollateralValueMinor] = useState<number | null>(null);
  const [collateralRegNo, setCollateralRegNo] = useState('');
  const [collateralLocation, setCollateralLocation] = useState<import('@/lib/data/geolocation-types').GeolocationInput | null>(null);
  const [collateralDocuments, setCollateralDocuments] = useState<PickedDocument[]>([]);

  const selectedProduct = useMemo(() => {
    if (!loan) return undefined;
    if (loan.loan_product_id != null) {
      const byId = productRows.find((p) => p.id === loan.loan_product_id);
      if (byId) return byId;
    }
    return productRows.find((p) => p.name === loan.product_name);
  }, [loan, productRows]);

  const collateralOptions = useMemo(() => {
    if (!loan) return [];
    return collateralOptionsForContext({
      isAgricultural: isAgriculturalProduct(
        selectedProduct?.category,
        loan.product_name,
        selectedProduct?.is_agricultural_product
      ),
      isGroupBorrower: borrowerIsGroupParent,
      acceptedCollateralTypes: selectedProduct?.accepted_collateral_types,
    });
  }, [loan, borrowerIsGroupParent, selectedProduct]);

  useEffect(() => {
    if (!collateralOptions.some((o) => o.value === collateralType)) {
      setCollateralType(defaultCollateralType(collateralOptions));
    }
  }, [collateralOptions, collateralType]);

  useEffect(() => {
    if (!USE_API) {
      setProductRows([]);
      return;
    }
    void (async () => {
      const local = await getLoanProductsLocal('staff');
      if (local.length > 0) {
        setProductRows(local);
        void refreshLoanProducts('staff').then(setProductRows).catch(() => undefined);
        return;
      }
      getLoanProducts('staff').then(setProductRows).catch(() => setProductRows([]));
    })();
  }, []);

  const fetchCollateral = async () => {
    if (!loan?.id) return;
    setLoading(true);
    try {
      const items = await getLoanCollateral(loan.id);
      setCollaterals(items);
    } catch {
      setCollaterals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCollateral(); }, [loan?.id]);

  useEffect(() => {
    if (!loan?.client_id || !USE_API) return;
    let cancelled = false;
    getClient(String(loan.client_id)).then((row) => {
      if (cancelled || !row) return;
      setBorrowerIsGroupParent(isGroupParentClient({ client_type: row.client_type, parent_client_id: row.parent_client_id ?? null }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loan?.client_id]);

  const resetForm = () => {
    setCollateralDesc('');
    setCollateralValueMinor(null);
    setCollateralRegNo('');
    setCollateralOtherLabel('');
    setCollateralLocation(null);
    setCollateralDocuments([]);
    setCollateralType('REAL_ESTATE');
  };

  const handleAdd = async () => {
    if (!loan) return;
    if (securityLocked) {
      Alert.alert('Locked', loanSecurityLockMessage(loan.status));
      return;
    }
    if (!collateralDesc.trim() || collateralValueMinor == null || collateralValueMinor <= 0) {
      Alert.alert('Required', 'Please enter description and valid MWK value.');
      return;
    }
    const showCapture = collateralShowsPropertyCapture(collateralType, collateralOtherLabel);
    if (showCapture) {
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
    }
    setSubmitting(true);
    try {
      await addLoanCollateral(loan.id, {
        collateral_type: collateralType,
        description: collateralDesc.trim(),
        estimated_value: collateralValueMinor,
        registration_number: collateralRegNo.trim() || undefined,
        other_type_label: collateralType === 'OTHER' ? collateralOtherLabel.trim() : undefined,
        geolocation: showCapture ? collateralLocation ?? undefined : undefined,
        documents:
          showCapture && collateralDocuments.length > 0
            ? collateralDocuments.map((d) => ({ uri: d.uri, name: d.name, docType: d.docType }))
            : undefined,
      });
      await fetchCollateral();
      setShowForm(false);
      resetForm();
      Alert.alert('Success', 'Collateral saved.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffDetailScreen title="Collateral" subtitle={loan?.loan_account_number} noPadding>
      <FlatList
        style={{ flex: 1 }}
        data={collaterals}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCollateral} />}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {securityLocked ? (
              <View style={styles.lockBanner}>
                <MaterialIcons name="lock" size={18} color="#92400e" />
                <ThemedText style={styles.lockText}>
                  {loanSecurityLockMessage(loan?.status)} Reuse is available after the loan is closed.
                </ThemedText>
              </View>
            ) : null}
            {!securityLocked ? (
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
                <MaterialIcons name={showForm ? 'expand-less' : 'add-location-alt'} size={20} color="#fff" />
                <ThemedText style={styles.addBtnText}>{showForm ? 'Hide form' : 'Add Collateral'}</ThemedText>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        ListFooterComponent={
          showForm ? (
            <View style={styles.form}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {collateralOptions.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => {
                      setCollateralType(t.value);
                      const d = defaultDescriptionForCollateralType(t.value);
                      if (d) setCollateralDesc(d);
                      if (!collateralShowsPropertyCapture(t.value, collateralOtherLabel)) {
                        setCollateralLocation(null);
                        setCollateralDocuments([]);
                      }
                    }}
                    style={[styles.chip, collateralType === t.value && styles.chipActive]}>
                    <ThemedText style={[styles.chipText, collateralType === t.value && styles.chipTextActive]}>{t.label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {collateralType === 'OTHER' && (
                <TextInput style={styles.input} placeholder="Specify type (e.g. land, shop)" value={collateralOtherLabel} onChangeText={setCollateralOtherLabel} />
              )}
              <TextInput style={styles.input} placeholder="Description" value={collateralDesc} onChangeText={setCollateralDesc} />
              <MwkMoneyInput
                label="Estimated value"
                valueMinor={collateralValueMinor}
                onChangeMinor={setCollateralValueMinor}
                placeholder="MWK 0"
              />
              {collateralShowsPropertyCapture(collateralType, collateralOtherLabel) ? (
                <TextInput style={styles.input} placeholder="Registration / title number (optional)" value={collateralRegNo} onChangeText={setCollateralRegNo} />
              ) : null}
              <CollateralPropertyCaptureFields
                collateralType={collateralType}
                otherTypeLabel={collateralOtherLabel}
                location={collateralLocation}
                onLocationChange={setCollateralLocation}
                documents={collateralDocuments}
                onDocumentsChange={setCollateralDocuments}
                disabled={submitting}
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={submitting}>
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={styles.saveBtnText}>Save Collateral</ThemedText>}
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <CollateralPropertyCard
            item={item}
            detailHref={
              loan ? propertyDetailHref(item.id, { kind: 'loan', loanId: loan.id }, 'staff') : undefined
            }
            onUpdateLocation={
              loan
                ? securityLocked
                  ? undefined
                  : async (location) => {
                      await setLoanCollateralLocation(loan.id, item.id, location);
                      await fetchCollateral();
                    }
                : undefined
            }
          />
        )}
        ListEmptyComponent={!loading ? <ThemedText style={styles.empty}>No collateral recorded.</ThemedText> : null}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
  },
  lockText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: CoFiColors.primary, paddingVertical: 10, borderRadius: Radius.md, marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  form: { backgroundColor: CoFiColors.backgroundCard, borderRadius: Radius.md, padding: 14, marginBottom: 16, gap: 10, borderWidth: 1, borderColor: CoFiColors.border },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: CoFiColors.backgroundCard },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  chipText: { fontSize: 12, color: CoFiColors.foreground },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  saveBtn: { backgroundColor: CoFiColors.primary, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', paddingVertical: 48, opacity: 0.5 },
});
