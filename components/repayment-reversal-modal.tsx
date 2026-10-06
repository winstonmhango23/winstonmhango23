import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors, Radius } from '@/constants/theme';
import { getStoredAuth } from '@/lib/storage';
import { ApiClientError } from '@/lib/api-client';
import { apiReverseRepayment, apiSearchRepayments } from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import type { ApiRepayment } from '@/lib/data/api';
import { useAuthStore } from '@/store/auth';

interface Props {
  visible: boolean;
  onClose: () => void;
  onReversed?: () => void;
}

export function RepaymentReversalModal({ visible, onClose, onReversed }: Props) {
  const [step, setStep] = useState<'search' | 'confirm'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ApiRepayment[]>([]);
  const [selectedRepayment, setSelectedRepayment] = useState<ApiRepayment | null>(null);
  const [reason, setReason] = useState('');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const items = await apiSearchRepayments(auth.token, searchQuery.trim());
      setResults(items);
    } catch {
      Alert.alert('Error', 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleReverse = async () => {
    if (!selectedRepayment || !reason.trim()) {
      Alert.alert('Required', 'Enter reversal reason.');
      return;
    }
    if (!useAuthStore.getState().hasPermission('loan:approve')) {
      Alert.alert(
        'Not permitted',
        'Reversing repayments requires loan:approve. Ask a manager or use the web BMS.'
      );
      return;
    }
    setSubmitting(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await apiReverseRepayment(auth.token, selectedRepayment.id, reason.trim());
      Alert.alert('Reversed', `Repayment #${selectedRepayment.id} reversed.`);
      onReversed?.();
      reset();
      onClose();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 403) {
        Alert.alert(
          'Not permitted',
          'You do not have loan:approve permission to reverse repayments.'
        );
      } else {
        Alert.alert('Error', e instanceof Error ? e.message : 'Reversal failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep('search');
    setSearchQuery('');
    setResults([]);
    setSelectedRepayment(null);
    setReason('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>Repayment Reversal</ThemedText>
            <TouchableOpacity onPress={handleClose}>
              <MaterialIcons name="close" size={22} color={CoFiColors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {step === 'search' && (
            <>
              <ThemedText style={styles.label}>Search for a repayment to reverse</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="Loan account, client name, or ref..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.actionBtn} onPress={handleSearch} disabled={searching}>
                {searching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.actionBtnText}>Search</ThemedText>
                )}
              </TouchableOpacity>

              {searching && <ActivityIndicator size="large" color={CoFiColors.primary} style={{ marginTop: 16 }} />}

              <ScrollView style={{ maxHeight: 240, marginTop: 12 }}>
                {results.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.resultItem, selectedRepayment?.id === r.id && styles.resultItemSelected]}
                    onPress={() => { setSelectedRepayment(r); setStep('confirm'); }}
                  >
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.resultTitle}>Repayment #{r.id}</ThemedText>
                      <ThemedText style={styles.resultSub}>
                        {r.loan_account_number ?? '—'} • {new Date(r.repayment_date).toLocaleDateString()}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.resultAmount}>{formatMinorMWK(r.amount ?? r.total_amount ?? 0)}</ThemedText>
                  </TouchableOpacity>
                ))}
                {results.length === 0 && !searching && searchQuery.trim() && (
                  <ThemedText style={{ textAlign: 'center', opacity: 0.5, paddingVertical: 24 }}>No results</ThemedText>
                )}
              </ScrollView>
            </>
          )}

          {step === 'confirm' && selectedRepayment && (
            <>
              <ThemedText style={styles.label}>Confirm Reversal</ThemedText>
              <View style={styles.detailCard}>
                <ThemedText style={styles.detailTitle}>Repayment #{selectedRepayment.id}</ThemedText>
                <ThemedText style={styles.detailRow}>Amount: {formatMinorMWK(selectedRepayment.amount ?? selectedRepayment.total_amount ?? 0)}</ThemedText>
                <ThemedText style={styles.detailRow}>Date: {new Date(selectedRepayment.repayment_date).toLocaleDateString()}</ThemedText>
                {selectedRepayment.loan_account_number && (
                  <ThemedText style={styles.detailRow}>Loan: {selectedRepayment.loan_account_number}</ThemedText>
                )}
              </View>

              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top', marginTop: 12 }]}
                placeholder="Reason for reversal *"
                multiline
                value={reason}
                onChangeText={setReason}
              />

              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep('search')}>
                  <ThemedText>Back</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.reverseBtn} onPress={handleReverse} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.reverseBtnText}>Reverse Payment</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: Radius.lg, padding: 20, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, opacity: 0.7 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: CoFiColors.backgroundCard },
  actionBtn: { backgroundColor: CoFiColors.primary, paddingVertical: 10, borderRadius: Radius.md, alignItems: 'center', marginTop: 12 },
  actionBtnText: { color: '#fff', fontWeight: '600' },
  resultItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  resultItemSelected: { backgroundColor: 'rgba(10,61,122,0.06)' },
  resultTitle: { fontWeight: '600', fontSize: 14 },
  resultSub: { fontSize: 12, opacity: 0.5, marginTop: 2 },
  resultAmount: { fontWeight: '700', fontSize: 15 },
  detailCard: { backgroundColor: CoFiColors.muted, borderRadius: Radius.md, padding: 14, gap: 6 },
  detailTitle: { fontWeight: '700', fontSize: 15, marginBottom: 4 },
  detailRow: { fontSize: 14 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db' },
  reverseBtn: { flex: 1, backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center' },
  reverseBtnText: { color: '#fff', fontWeight: '600' },
});
