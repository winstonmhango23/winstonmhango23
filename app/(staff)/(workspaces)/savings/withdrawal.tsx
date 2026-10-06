import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { CoFiColors, Radius } from '@/constants/theme';
import { isWithdrawableCategory } from '@/lib/account-categories';
import { accountBookBalanceMinor } from '@/lib/account-operations';
import { getStaffClientAccounts, submitStaffClientWithdrawal } from '@/lib/data';
import type { ApiStaffSavingsAccount } from '@/lib/data/savings-api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { useClientsStore, type Client } from '@/store/clients';

export default function WithdrawalScreen() {
  const router = useRouter();
  const { clients, fetchClients } = useClientsStore();
  const [query, setQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [accounts, setAccounts] = useState<ApiStaffSavingsAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetchClients();
  }, [fetchClients]);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 20);
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.customerNumber ?? '').toLowerCase().includes(q) ||
          (c.phoneNumber ?? '').includes(q)
      )
      .slice(0, 20);
  }, [clients, query]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const loadAccounts = async (client: Client) => {
    setSelectedClient(client);
    setSelectedAccountId(null);
    setAccounts([]);
    setLoadingAccounts(true);
    try {
      const list = await getStaffClientAccounts(Number(client.id));
      setAccounts(
        list.filter(
          (a) =>
            String(a.status).toUpperCase() === 'ACTIVE' &&
            isWithdrawableCategory(a.account_category)
        )
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load accounts');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedClient || !selectedAccountId || !selectedAccount) {
      Alert.alert('Required', 'Select a client and account.');
      return;
    }
    if (amountMinor == null || amountMinor <= 0) {
      Alert.alert('Invalid', 'Enter a valid MWK withdrawal amount.');
      return;
    }
    if (amountMinor > accountBookBalanceMinor(selectedAccount)) {
      Alert.alert('Insufficient', 'Amount exceeds account book balance.');
      return;
    }
    setSubmitting(true);
    try {
      await submitStaffClientWithdrawal(Number(selectedClient.id), {
        account_id: selectedAccountId,
        amount_minor: amountMinor,
        withdrawal_method: 'CASH',
        notes: notes.trim() || undefined,
      });
      Alert.alert('Success', 'Withdrawal submitted for review.');
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Withdrawal failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffDetailScreen title="New Withdrawal" subtitle="Record a client withdrawal" scroll>
      <ThemedText style={styles.label}>Client</ThemedText>
      <TextInput
        style={styles.input}
        placeholder="Search name, client ID, phone"
        value={query}
        onChangeText={setQuery}
        placeholderTextColor="#9ca3af"
      />
      {!selectedClient ? (
        <FlatList
          data={filteredClients}
          keyExtractor={(c) => c.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.accountCard} onPress={() => void loadAccounts(item)}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.accountName}>{item.name}</ThemedText>
                <ThemedText style={styles.accountSub}>
                  {item.customerNumber ?? item.id}
                  {item.phoneNumber ? ` · ${item.phoneNumber}` : ''}
                </ThemedText>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={CoFiColors.mutedForeground} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<ThemedText style={styles.hint}>No matching clients.</ThemedText>}
        />
      ) : (
        <>
          <TouchableOpacity
            style={styles.selectedClient}
            onPress={() => {
              setSelectedClient(null);
              setAccounts([]);
              setSelectedAccountId(null);
            }}
          >
            <ThemedText style={styles.accountName}>{selectedClient.name}</ThemedText>
            <ThemedText style={styles.change}>Change</ThemedText>
          </TouchableOpacity>

          <ThemedText style={styles.label}>Account (MAIN / SAVINGS / REPAYMENT)</ThemedText>
          {loadingAccounts ? (
            <ActivityIndicator color={CoFiColors.primary} />
          ) : (
            accounts.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.accountCard, selectedAccountId === a.id && styles.accountCardSelected]}
                onPress={() => setSelectedAccountId(a.id)}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.accountName}>{a.account_number}</ThemedText>
                  <ThemedText style={styles.accountSub}>
                    {a.account_category ?? a.account_type} · Book {formatMinorMWK(a.balance)}
                  </ThemedText>
                </View>
                {selectedAccountId === a.id ? (
                  <MaterialIcons name="check-circle" size={22} color={CoFiColors.primary} />
                ) : null}
              </TouchableOpacity>
            ))
          )}

          <MwkMoneyInput
            label="Amount"
            valueMinor={amountMinor}
            onChangeMinor={setAmountMinor}
            placeholder="MWK 0"
            style={{ marginTop: 12 }}
          />

          <ThemedText style={styles.label}>Notes (optional)</ThemedText>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="Withdrawal notes..."
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholderTextColor="#9ca3af"
          />

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() => void handleSubmit()}
            disabled={submitting || !selectedAccountId}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="arrow-upward" size={20} color="#fff" />
                <ThemedText style={styles.submitBtnText}>Submit withdrawal</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12, opacity: 0.7 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: CoFiColors.backgroundCard,
    marginBottom: 8,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    marginBottom: 8,
    backgroundColor: CoFiColors.backgroundCard,
  },
  accountCardSelected: {
    borderColor: CoFiColors.primary,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  accountName: { fontWeight: '600', fontSize: 14 },
  accountSub: { fontSize: 12, opacity: 0.5, marginTop: 2 },
  selectedClient: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  change: { color: CoFiColors.primary, fontWeight: '700' },
  hint: { fontSize: 13, opacity: 0.6, marginTop: 8 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 14,
    borderRadius: Radius.md,
    marginTop: 24,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
