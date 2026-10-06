import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { getStoredAuth } from '@/lib/storage';
import * as api from '@/lib/data/api';

const WORKOUT_TYPES = ['RESTRUCTURE', 'RESCHEDULE', 'REFINANCE', 'FORBEARANCE', 'WRITE_OFF'];

export default function LoanWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loanId = parseInt(id ?? '0', 10);
  const [requests, setRequests] = useState<api.ApiWorkoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [reqType, setReqType] = useState(WORKOUT_TYPES[0]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      setRequests(await api.apiGetLoanWorkoutRequests(auth.token, loanId));
    } catch { setRequests([]); } finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, [loanId]);

  const handleAdd = async () => {
    if (!description.trim()) { Alert.alert('Required', 'Describe the workout request.'); return; }
    setSubmitting(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await api.apiCreateWorkoutRequest(auth.token, loanId, { request_type: reqType, description: description.trim() });
      await fetch(); setShowForm(false); setDescription('');
      Alert.alert('Submitted', 'Workout request created.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create workout request.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (s: string) =>
    s === 'APPROVED' ? '#22c55e' : s === 'REJECTED' ? '#ef4444' : s === 'RESOLVED' ? '#3498db' : '#f59e0b';

  return (
    <StaffDetailScreen title="Workout requests" subtitle={id ? `Loan ${id}` : undefined} noPadding>
      <FlatList
        style={{ flex: 1 }}
        data={requests}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetch} />}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm((v) => !v)}>
            <MaterialIcons name={showForm ? 'expand-less' : 'add'} size={20} color="#fff" />
            <ThemedText style={styles.addBtnText}>{showForm ? 'Hide' : 'New Workout Request'}</ThemedText>
          </TouchableOpacity>
        }
        ListFooterComponent={showForm ? (
          <View style={styles.form}>
            <ThemedText style={styles.formLabel}>Request Type</ThemedText>
            <View style={styles.chipRow}>
              {WORKOUT_TYPES.map((t) => (
                <TouchableOpacity key={t} onPress={() => setReqType(t)} style={[styles.chip, reqType === t && styles.chipActive]}>
                  <ThemedText style={[styles.chipText, reqType === t && styles.chipTextActive]}>{t}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Describe the situation..." multiline value={description} onChangeText={setDescription} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={submitting}>
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={styles.saveBtnText}>Submit Request</ThemedText>}
            </TouchableOpacity>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={{ flex: 1 }}>
              <View style={styles.itemHeader}>
                <ThemedText style={styles.itemTitle}>{item.request_type}</ThemedText>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '20' }]}>
                  <ThemedText style={[styles.statusText, { color: statusColor(item.status) }]}>{item.status}</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.itemDesc}>{item.description}</ThemedText>
              <ThemedText style={styles.itemDate}>{new Date(item.created_at).toLocaleDateString()} by {item.requested_by_name ?? '—'}</ThemedText>
            </View>
          </View>
        )}
        ListEmptyComponent={!loading ? <ThemedText style={styles.empty}>No workout requests.</ThemedText> : null}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: CoFiColors.primary, paddingVertical: 10, borderRadius: Radius.md, marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  form: { backgroundColor: CoFiColors.backgroundCard, borderRadius: Radius.md, padding: 14, marginBottom: 16, gap: 10, borderWidth: 1, borderColor: CoFiColors.border },
  formLabel: { fontSize: 14, fontWeight: '600', opacity: 0.7 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  chipText: { fontSize: 11, color: CoFiColors.foreground },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: CoFiColors.primary, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  item: { backgroundColor: CoFiColors.backgroundCard, borderRadius: Radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: CoFiColors.border },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  itemTitle: { fontWeight: '600', fontSize: 15 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '600' },
  itemDesc: { fontSize: 13, opacity: 0.7, marginTop: 4 },
  itemDate: { fontSize: 11, opacity: 0.4, marginTop: 6 },
  empty: { textAlign: 'center', paddingVertical: 48, opacity: 0.5 },
});
