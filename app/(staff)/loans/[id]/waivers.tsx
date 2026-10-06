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

export default function LoanWaiversScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loanId = parseInt(id ?? '0', 10);
  const [waivers, setWaivers] = useState<api.ApiWaiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('INTEREST');
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      setWaivers(await api.apiGetLoanWaivers(auth.token, loanId));
    } catch { setWaivers([]); } finally { setLoading(false); }
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
      await api.apiRequestLoanWaiver(auth.token, loanId, {
        waiver_type: type,
        amount: amountMinor,
        reason: reason.trim(),
      });
      await fetch();
      setShowForm(false);
      setAmountMinor(null);
      setReason('');
      Alert.alert('Success', 'Waiver request submitted.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to submit waiver.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffDetailScreen title="Waivers" subtitle={id ? `Loan ${id}` : undefined} noPadding>
      <FlatList
        style={{ flex: 1 }}
        data={waivers}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetch} />}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <MaterialIcons name={showForm ? 'expand-less' : 'add'} size={20} color="#fff" />
            <ThemedText style={styles.addBtnText}>{showForm ? 'Hide' : 'Request Waiver'}</ThemedText>
          </TouchableOpacity>
        }
        ListFooterComponent={showForm ? (
          <View style={styles.form}>
            <TextInput style={styles.input} placeholder="Type (e.g. INTEREST, PENALTY)" value={type} onChangeText={setType} />
            <MwkMoneyInput
              label="Amount"
              valueMinor={amountMinor}
              onChangeMinor={setAmountMinor}
              placeholder="MWK 0"
            />
            <TextInput style={styles.input} placeholder="Reason" multiline value={reason} onChangeText={setReason} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={submitting}>
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={styles.saveBtnText}>Submit Waiver Request</ThemedText>}
            </TouchableOpacity>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.itemTitle}>{item.waiver_type}</ThemedText>
              <ThemedText style={styles.itemSub}>{item.reason}</ThemedText>
              <ThemedText style={styles.itemDate}>{new Date(item.created_at).toLocaleDateString()}</ThemedText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText style={styles.itemAmount}>{formatMinorMWK(item.amount)}</ThemedText>
              <ThemedText style={[styles.itemStatus, { color: item.approved ? '#22c55e' : '#f59e0b' }]}>{item.approved ? 'Approved' : 'Pending'}</ThemedText>
            </View>
          </View>
        )}
        ListEmptyComponent={!loading ? <ThemedText style={styles.empty}>No waivers.</ThemedText> : null}
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
