/**
 * StaffLoanPickerModal – pick an eligible loan, then hand off to StaffRepaymentModal.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import type { Loan } from '@/store';

interface StaffLoanPickerModalProps {
  visible: boolean;
  onClose: () => void;
  loans: Loan[];
  onSelectLoan: (loan: Loan) => void;
}

export function StaffLoanPickerModal({
  visible,
  onClose,
  loans,
  onSelectLoan,
}: StaffLoanPickerModalProps) {
  const eligibleLoans = loans.filter((l) =>
    ['DISBURSED', 'ACTIVE'].includes((l.status || '').toUpperCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>
              Select loan
            </ThemedText>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <ThemedText style={styles.hint}>
              Choose a loan to open the repayment form (schedule, amount, and payment method).
            </ThemedText>
            <View style={styles.loanList}>
              {eligibleLoans.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  style={styles.loanCard}
                  onPress={() => onSelectLoan(l)}
                  activeOpacity={0.7}
                >
                  <View style={styles.loanCardRow}>
                    <View style={styles.loanCardText}>
                      <ThemedText type="defaultSemiBold">{l.loan_account_number}</ThemedText>
                      <ThemedText style={styles.loanMeta}>
                        {l.client_name} • {formatMinorMWK(l.outstanding_principal)}
                      </ThemedText>
                    </View>
                    <MaterialIcons name="chevron-right" size={22} color="#9ca3af" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {eligibleLoans.length === 0 ? (
              <ThemedText style={styles.empty}>No active loans available to repay</ThemedText>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#f8f9fb',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 18 },
  body: { maxHeight: 480 },
  bodyContent: { padding: 20, paddingBottom: 32 },
  hint: { fontSize: 13, opacity: 0.7, marginBottom: 14 },
  loanList: { gap: 8 },
  loanCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  loanCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loanCardText: { flex: 1, minWidth: 0 },
  loanMeta: { fontSize: 13, opacity: 0.8, marginTop: 4 },
  empty: { opacity: 0.6, marginTop: 8 },
});
