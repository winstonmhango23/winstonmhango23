import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { CoFiColors, Radius } from '@/constants/theme';
import { getStoredAuth } from '@/lib/storage';
import * as api from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

export default function LoanPenaltiesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loanId = parseInt(id ?? '0', 10);
  const [penalties, setPenalties] = useState<api.ApiPenalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('LATE_PAYMENT');
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const items = await api.apiGetLoanPenalties(auth.token, loanId);
      setPenalties(items);
    } catch { setPenalties([]); } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [loanId]);

  const handleAdd = async () => {
    if (amountMinor == null || amountMinor <= 0 || !reason.trim()) {
      Alert.alert('Required', 'Enter MWK amount and reason.');
      return;
    }
    setSubmitting(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await api.apiAddLoanPenalty(auth.token, loanId, {
        penalty_type: type,
        amount: amountMinor,
        reason: reason.trim(),
      });
      await fetch();
      setShowForm(false);
      setAmountMinor(null);
      setReason('');
      Alert.alert('Success', 'Penalty imposed.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to impose penalty.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffDetailScreen title="Penalties" subtitle={id ? `Loan ${id}` : undefined} noPadding>
      <FlatList
        style={{ flex: 1 }}
        data={penalties}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetch} />}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <MaterialIcons name={showForm ? 'expand-less' : 'add'} size={20} color="#fff" />
            <ThemedText style={styles.addBtnText}>{showForm ? 'Hide' : 'Impose Penalty'}</ThemedText>
          </TouchableOpacity>
        }
        ListFooterComponent={showForm ? (
          <View style={styles.form}>
            <TextInput style={styles.input} placeholder="Type (e.g. LATE_PAYMENT)" value={type} onChangeText={setType} />
            <MwkMoneyInput
              label="Amount"
              valueMinor={amountMinor}
              onChangeMinor={setAmountMinor}
              placeholder="MWK 0"
            />
            <TextInput style={styles.input} placeholder="Reason" multiline value={reason} onChangeText={setReason} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={submitting}>
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={styles.saveBtnText}>Impose Penalty</ThemedText>}
            </TouchableOpacity>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.itemTitle}>{item.penalty_type}</ThemedText>
              <ThemedText style={styles.itemSub}>{item.reason}</ThemedText>
              <ThemedText style={styles.itemDate}>{new Date(item.imposed_at).toLocaleDateString()} by {item.imposed_by_name ?? '—'}</ThemedText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText style={[styles.itemAmount, item.paid ? { color: '#22c55e' } : { color: '#ef4444' }]}>{formatMinorMWK(item.amount)}</ThemedText>
              <ThemedText style={styles.itemStatus}>{item.paid ? 'Paid' : 'Unpaid'}</ThemedText>
            </View>
          </View>
        )}
        ListEmptyComponent={!loading ? <ThemedText style={styles.empty}>No penalties.</ThemedText> : null}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: CoFiColors.primary, paddingVertical: 10, borderRadius: Radius.md, marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  form: { backgroundColor: CoFiColors.backgroundCard, borderRadius: Radius.md, padding: 14, marginBottom: 16, gap: 10, borderWidth: 1, borderColor: CoFiColors.border },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  saveBtn: { backgroundColor: CoFiColors.primary, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  item: { flexDirection: 'row', backgroundColor: CoFiColors.backgroundCard, borderRadius: Radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: CoFiColors.border },
  itemTitle: { fontWeight: '600', fontSize: 15 }, itemSub: { fontSize: 13, opacity: 0.6, marginTop: 2 }, itemDate: { fontSize: 11, opacity: 0.4, marginTop: 2 },
  itemAmount: { fontWeight: '700', fontSize: 15 }, itemStatus: { fontSize: 11, opacity: 0.5, marginTop: 2 },
  empty: { textAlign: 'center', paddingVertical: 48, opacity: 0.5 },
});
