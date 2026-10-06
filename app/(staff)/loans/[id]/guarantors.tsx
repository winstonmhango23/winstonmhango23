import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
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
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { CoFiColors, Radius } from '@/constants/theme';
import { useLoansStore } from '@/store/loans';
import {
  getLoanGuarantors,
  addLoanGuarantor,
  removeLoanGuarantor,
  getStaffClientGuarantors,
  upsertStaffClientGuarantor,
  type ApiGuarantor,
  type GuarantorCatalogEntry,
} from '@/lib/data';
import { buildGuarantorPayloadFromCatalog } from '@/lib/data/guarantor-catalog';
import {
  isLoanSecurityLocked,
  loanSecurityLockMessage,
} from '@/lib/loan-origination/security-lock';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

export default function LoanGuarantorsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loan = useLoansStore((s) => s.loans.find((l) => String(l.id) === id));
  const securityLocked = isLoanSecurityLocked(loan?.status);

  const [guarantors, setGuarantors] = useState<ApiGuarantor[]>([]);
  const [catalog, setCatalog] = useState<GuarantorCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCatalogId, setSelectedCatalogId] = useState<number | null>(null);

  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [relationship, setRelationship] = useState('');
  const [occupation, setOccupation] = useState('');
  const [monthlyIncomeMinor, setMonthlyIncomeMinor] = useState<number | null>(null);
  const [guaranteeAmountMinor, setGuaranteeAmountMinor] = useState<number | null>(null);

  const borrowerClientId =
    typeof loan?.client_id === 'number'
      ? loan.client_id
      : loan?.client_id != null
        ? Number(loan.client_id)
        : NaN;

  const fetchGuarantors = useCallback(async () => {
    if (!loan?.id) return;
    setLoading(true);
    try {
      const [items, catalogRows] = await Promise.all([
        getLoanGuarantors(loan.id),
        Number.isFinite(borrowerClientId) && borrowerClientId > 0
          ? getStaffClientGuarantors(borrowerClientId).catch(() => [])
          : Promise.resolve([] as GuarantorCatalogEntry[]),
      ]);
      setGuarantors(items);
      setCatalog(catalogRows);
    } catch {
      setGuarantors([]);
    } finally {
      setLoading(false);
    }
  }, [loan?.id, borrowerClientId]);

  useEffect(() => {
    fetchGuarantors();
  }, [fetchGuarantors]);

  const resetForm = () => {
    setShowForm(false);
    setSelectedCatalogId(null);
    setFullName('');
    setNationalId('');
    setPhoneNumber('');
    setEmail('');
    setAddress('');
    setRelationship('');
    setOccupation('');
    setMonthlyIncomeMinor(null);
    setGuaranteeAmountMinor(null);
  };

  const selectCatalog = (g: GuarantorCatalogEntry) => {
    setSelectedCatalogId(g.id);
    setFullName(g.full_name ?? '');
    setNationalId(g.national_id ?? '');
    setPhoneNumber(g.phone_number ?? '');
    setEmail(g.email ?? '');
    setAddress(g.address ?? '');
    setRelationship(g.relationship_to_borrower ?? '');
    setOccupation(g.occupation ?? '');
    setMonthlyIncomeMinor(
      typeof g.monthly_income === 'number' && g.monthly_income > 0 ? g.monthly_income : null
    );
    setGuaranteeAmountMinor(
      typeof g.guarantee_amount === 'number' && g.guarantee_amount > 0 ? g.guarantee_amount : null
    );
  };

  const handleAdd = async () => {
    if (!loan) return;
    if (securityLocked) {
      Alert.alert('Locked', loanSecurityLockMessage(loan.status));
      return;
    }
    const selected = catalog.find((g) => g.id === selectedCatalogId);
    const name = fullName.trim() || selected?.full_name?.trim();
    if (!name || !phoneNumber.trim()) {
      Alert.alert(
        'Required',
        'Select a client guarantor or enter full name and phone number.'
      );
      return;
    }
    setSubmitting(true);
    try {
      const payload = selected
        ? buildGuarantorPayloadFromCatalog(selected, {
            full_name: name,
            national_id: nationalId.trim() || undefined,
            phone_number: phoneNumber.trim(),
            email: email.trim() || undefined,
            address: address.trim() || undefined,
            relationship_to_borrower: relationship.trim() || undefined,
            occupation: occupation.trim() || undefined,
            monthly_income:
              monthlyIncomeMinor != null && monthlyIncomeMinor > 0 ? monthlyIncomeMinor : undefined,
            guarantee_amount:
              guaranteeAmountMinor != null && guaranteeAmountMinor > 0
                ? guaranteeAmountMinor
                : undefined,
          })
        : {
            full_name: name,
            national_id: nationalId.trim() || undefined,
            phone_number: phoneNumber.trim(),
            email: email.trim() || undefined,
            address: address.trim() || undefined,
            relationship_to_borrower: relationship.trim() || undefined,
            occupation: occupation.trim() || undefined,
            monthly_income:
              monthlyIncomeMinor != null && monthlyIncomeMinor > 0 ? monthlyIncomeMinor : undefined,
            guarantee_amount:
              guaranteeAmountMinor != null && guaranteeAmountMinor > 0
                ? guaranteeAmountMinor
                : undefined,
          };

      if (!selected && Number.isFinite(borrowerClientId) && borrowerClientId > 0) {
        try {
          await upsertStaffClientGuarantor(borrowerClientId, payload);
        } catch {
          /* best-effort catalog write */
        }
      }

      await addLoanGuarantor(loan.id, payload);
      await fetchGuarantors();
      resetForm();
      Alert.alert('Success', 'Guarantor added.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add guarantor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = (g: ApiGuarantor) => {
    if (!loan) return;
    if (securityLocked) {
      Alert.alert('Locked', loanSecurityLockMessage(loan.status));
      return;
    }
    Alert.alert(
      'Return guarantor',
      `Return ${g.full_name} to the borrower catalog for reuse? Only allowed after the loan is fully repaid.`,
      [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Return',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeLoanGuarantor(loan.id, g.id);
            await fetchGuarantors();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove guarantor.');
          }
        },
      },
    ]);
  };

  return (
    <StaffDetailScreen title="Guarantors" subtitle={loan?.loan_account_number} noPadding>
      <FlatList
        style={{ flex: 1 }}
        data={guarantors}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchGuarantors} />}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {securityLocked ? (
              <View style={styles.lockBanner}>
                <MaterialIcons name="lock" size={18} color="#92400e" />
                <ThemedText style={styles.lockText}>
                  {loanSecurityLockMessage(loan?.status)} Guarantors return to the catalog after close.
                </ThemedText>
              </View>
            ) : null}
            {!securityLocked ? (
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
                <MaterialIcons name={showForm ? 'expand-less' : 'person-add'} size={20} color="#fff" />
                <ThemedText style={styles.addBtnText}>{showForm ? 'Hide form' : 'Add Guarantor'}</ThemedText>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        ListFooterComponent={
          showForm ? (
            <View style={styles.form}>
              {catalog.length > 0 ? (
                <View style={{ gap: 8, marginBottom: 4 }}>
                  <ThemedText style={styles.catalogLabel}>
                    Guarantors already linked to this client
                  </ThemedText>
                  {catalog.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[
                        styles.catalogRow,
                        selectedCatalogId === g.id && styles.catalogRowSelected,
                      ]}
                      onPress={() => selectCatalog(g)}
                    >
                      <ThemedText style={styles.catalogName}>{g.full_name}</ThemedText>
                      <ThemedText style={styles.catalogMeta}>
                        {[g.phone_number, g.relationship_to_borrower].filter(Boolean).join(' · ') ||
                          'Saved guarantor'}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <ThemedText style={styles.catalogMeta}>
                  No guarantors on this client’s catalog yet. Enter a new guarantor below.
                </ThemedText>
              )}
              <TextInput
                style={styles.input}
                placeholder="Full name *"
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  if (selectedCatalogId != null) setSelectedCatalogId(null);
                }}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone number *"
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
              />
              <TextInput
                style={styles.input}
                placeholder="National ID"
                value={nationalId}
                onChangeText={setNationalId}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Address"
                value={address}
                onChangeText={setAddress}
              />
              <TextInput
                style={styles.input}
                placeholder="Relationship to borrower (e.g. Spouse, Parent)"
                value={relationship}
                onChangeText={setRelationship}
              />
              <TextInput
                style={styles.input}
                placeholder="Occupation"
                value={occupation}
                onChangeText={setOccupation}
              />
              <MwkMoneyInput
                label="Monthly income"
                valueMinor={monthlyIncomeMinor}
                onChangeMinor={setMonthlyIncomeMinor}
                placeholder="MWK 0"
              />
              <MwkMoneyInput
                label="Guarantee amount"
                valueMinor={guaranteeAmountMinor}
                onChangeMinor={setGuaranteeAmountMinor}
                placeholder="MWK 0"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.saveBtnText}>Save Guarantor</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.itemTitle}>{item.full_name}</ThemedText>
              <ThemedText style={styles.itemSub}>
                {item.phone_number ?? '—'} {item.national_id ? `• ${item.national_id}` : ''}
              </ThemedText>
              {item.relationship_to_borrower ? (
                <ThemedText style={styles.itemSub}>{item.relationship_to_borrower}</ThemedText>
              ) : null}
              {item.guarantee_amount ? (
                <ThemedText style={styles.itemAmount}>
                  {formatMinorMWK(item.guarantee_amount)}
                </ThemedText>
              ) : null}
            </View>
            {!securityLocked ? (
              <TouchableOpacity onPress={() => handleRemove(item)} style={styles.removeBtn}>
                <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            ) : (
              <MaterialIcons name="lock" size={18} color="#92400e" />
            )}
          </View>
        )}
        ListEmptyComponent={
          !loading ? <ThemedText style={styles.empty}>No guarantors recorded.</ThemedText> : null
        }
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
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
  catalogLabel: { fontWeight: '700', fontSize: 13 },
  catalogRow: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: Radius.sm,
    padding: 10,
    backgroundColor: CoFiColors.background,
  },
  catalogRowSelected: {
    borderColor: CoFiColors.primary,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  catalogName: { fontWeight: '600', fontSize: 14 },
  catalogMeta: { fontSize: 12, opacity: 0.65, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: CoFiColors.backgroundCard,
  },
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
  itemAmount: { fontWeight: '700', fontSize: 15, marginTop: 4 },
  removeBtn: { padding: 8 },
  empty: { textAlign: 'center', paddingVertical: 48, opacity: 0.5 },
});
