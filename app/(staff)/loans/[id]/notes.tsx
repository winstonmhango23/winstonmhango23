import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { getStoredAuth } from '@/lib/storage';
import * as api from '@/lib/data/api';

export default function LoanNotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const loanId = parseInt(id ?? '0', 10);
  const [notes, setNotes] = useState<api.ApiLoanNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      setNotes(await api.apiGetLoanNotes(auth.token, loanId));
    } catch { setNotes([]); } finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, [loanId]);

  const handleAdd = async () => {
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await api.apiAddLoanNote(auth.token, loanId, { note: newNote.trim() });
      await fetch(); setNewNote('');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add note.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffDetailScreen title="Notes" subtitle={id ? `Loan ${id}` : undefined} noPadding>
      <FlatList
        style={{ flex: 1 }}
        data={notes}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetch} />}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View style={styles.addRow}>
            <TextInput style={styles.input} placeholder="Add a note..." value={newNote} onChangeText={setNewNote} multiline />
            <TouchableOpacity style={styles.addBtn} onPress={handleAdd} disabled={submitting || !newNote.trim()}>
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="send" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemHeader}>
              <MaterialIcons name="person" size={16} color={CoFiColors.mutedForeground} />
              <ThemedText style={styles.itemAuthor}>{item.created_by_name ?? 'Staff'}</ThemedText>
              <ThemedText style={styles.itemDate}>{new Date(item.created_at).toLocaleDateString()}</ThemedText>
            </View>
            <ThemedText style={styles.itemText}>{item.note}</ThemedText>
          </View>
        )}
        ListEmptyComponent={!loading ? <ThemedText style={styles.empty}>No notes yet.</ThemedText> : null}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: CoFiColors.backgroundCard, maxHeight: 80 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: CoFiColors.primary, alignItems: 'center', justifyContent: 'center' },
  item: { backgroundColor: CoFiColors.backgroundCard, borderRadius: Radius.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: CoFiColors.border },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  itemAuthor: { fontSize: 13, fontWeight: '600' },
  itemDate: { fontSize: 11, opacity: 0.4 },
  itemText: { fontSize: 14, lineHeight: 20 },
  empty: { textAlign: 'center', paddingVertical: 48, opacity: 0.5 },
});
