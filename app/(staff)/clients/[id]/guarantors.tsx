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
import {
  getClient,
  getStaffClientGuarantors,
  upsertStaffClientGuarantor,
  type GuarantorCatalogEntry,
} from '@/lib/data';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

/**
 * Staff management of guarantors linked to a client (shared across LO / CIO).
 * These catalog entries are what loan application / loan screens discover.
 */
export default function ClientGuarantorsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clientId = parseInt(id ?? '', 10);

  const [clientName, setClientName] = useState<string | undefined>();
  const [items, setItems] = useState<GuarantorCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [occupation, setOccupation] = useState('');
  const [monthlyIncomeMinor, setMonthlyIncomeMinor] = useState<number | null>(null);
  const [guaranteeAmountMinor, setGuaranteeAmountMinor] = useState<number | null>(null);

  const fetchCatalog = useCallback(async () => {
    if (!Number.isFinite(clientId) || clientId <= 0) return;
    setLoading(true);
    try {
      const [client, rows] = await Promise.all([
        getClient(String(clientId)).catch(() => null),
        getStaffClientGuarantors(clientId),
      ]);
      setClientName(client?.name);
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const handleAdd = async () => {
    if (!fullName.trim() || !phoneNumber.trim()) {
      Alert.alert('Required', 'Enter full name and phone number.');
      return;
    }
    if (!Number.isFinite(clientId) || clientId <= 0) return;
    setSubmitting(true);
    try {
      const created = await upsertStaffClientGuarantor(clientId, {
        full_name: fullName.trim(),
        national_id: nationalId.trim() || undefined,
        phone_number: phoneNumber.trim(),
        email: email.trim() || undefined,
        relationship_to_borrower: relationship.trim() || undefined,
        occupation: occupation.trim() || undefined,
        monthly_income:
          monthlyIncomeMinor != null && monthlyIncomeMinor > 0 ? monthlyIncomeMinor : undefined,
        guarantee_amount:
          guaranteeAmountMinor != null && guaranteeAmountMinor > 0
            ? guaranteeAmountMinor
            : undefined,
      });
      if (!created) {
        Alert.alert(
          'Saved locally for loan use',
          'The server catalog write endpoint is unavailable. You can still attach this guarantor from a loan application by entering the same details.'
        );
      }
      await fetchCatalog();
      setShowForm(false);
      setFullName('');
      setNationalId('');
      setPhoneNumber('');
      setEmail('');
      setRelationship('');
      setOccupation('');
      setMonthlyIncomeMinor(null);
      setGuaranteeAmountMinor(null);
      if (created) Alert.alert('Saved', 'Guarantor added to this client.');
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error && e.message.trim() ? e.message : 'Failed to save guarantor.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffDetailScreen
      title="Client guarantors"
      subtitle={clientName ?? (id ? `Client ${id}` : undefined)}
      noPadding
    >
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCatalog} />}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <>
            <ThemedText style={styles.hint}>
              Guarantors linked to this client are available to loan officers and CIO when attaching
              guarantors to applications and loans.
            </ThemedText>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
              <MaterialIcons
                name={showForm ? 'expand-less' : 'person-add'}
                size={20}
                color="#fff"
              />
              <ThemedText style={styles.addBtnText}>
                {showForm ? 'Hide form' : 'Add guarantor'}
              </ThemedText>
            </TouchableOpacity>
          </>
        }
        ListFooterComponent={
          showForm ? (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Full name *"
                value={fullName}
                onChangeText={setFullName}
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
                placeholder="Relationship to borrower"
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
              />
              <MwkMoneyInput
                label="Typical guarantee amount"
                valueMinor={guaranteeAmountMinor}
                onChangeMinor={setGuaranteeAmountMinor}
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.saveBtnText}>Save guarantor</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <MaterialIcons name="verified-user" size={22} color={CoFiColors.primary} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <ThemedText style={styles.itemTitle}>{item.full_name}</ThemedText>
              <ThemedText style={styles.itemSub}>
                {[item.phone_number, item.national_id, item.relationship_to_borrower]
                  .filter(Boolean)
                  .join(' · ') || 'Guarantor'}
              </ThemedText>
              {item.guarantee_amount ? (
                <ThemedText style={styles.itemAmount}>
                  {formatMinorMWK(item.guarantee_amount)}
                </ThemedText>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <ThemedText style={styles.empty}>No guarantors linked to this client yet.</ThemedText>
          ) : null
        }
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, opacity: 0.7, marginBottom: 12, lineHeight: 18 },
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
  itemAmount: { fontWeight: '700', fontSize: 14, marginTop: 4 },
  empty: { textAlign: 'center', paddingVertical: 48, opacity: 0.5 },
});
