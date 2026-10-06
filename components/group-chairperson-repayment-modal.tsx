/**
 * Record repayment on behalf of a group member — portal GroupChairpersonRepaymentModal parity.
 * Requires can_record_group_repayments; posts to POST /customer/repayments with
 * payment_method GROUP_CHAIRPERSON_DEPOSIT and recorded_by_member_id.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientModalShell, clientModalStyles } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import type { MobileLoanSummary } from '@/lib/data/api';
import { getMobileGroupMemberLoans, submitCustomerRepayment } from '@/lib/data';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';

type Props = {
  visible: boolean;
  memberId: number;
  memberName: string;
  onClose: () => void;
  onSuccess?: () => void;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GroupChairpersonRepaymentModal({
  visible,
  memberId,
  memberName,
  onClose,
  onSuccess,
}: Props) {
  const [loans, setLoans] = useState<MobileLoanSummary[]>([]);
  const [loansLoading, setLoansLoading] = useState(false);
  const [loanId, setLoanId] = useState<number | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setLoanId(null);
    setAmountMinor(null);
    setReceiptNumber('');
    setPaymentDate(todayIso());
    setReceiptUri(null);
    setReceiptName(null);
    setSubmitting(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!visible || !(memberId > 0)) return;
    reset();
    setLoansLoading(true);
    void getMobileGroupMemberLoans(memberId)
      .then((rows) => {
        setLoans(rows);
        if (rows.length === 1) setLoanId(rows[0].id);
      })
      .catch((e) => {
        setLoans([]);
        setError(e instanceof Error ? e.message : 'Could not load member loans');
      })
      .finally(() => setLoansLoading(false));
  }, [visible, memberId, reset]);

  const selectedLoan = loans.find((l) => l.id === loanId);
  const outstanding = selectedLoan
    ? selectedLoan.my_share_outstanding_minor ??
      selectedLoan.outstanding_principal + selectedLoan.outstanding_interest
    : 0;

  const pickReceipt = async (fromCamera: boolean) => {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('Camera permission is required to capture a receipt.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
        });
        if (!result.canceled && result.assets[0]) {
          setReceiptUri(result.assets[0].uri);
          setReceiptName(result.assets[0].fileName ?? `receipt-${Date.now()}.jpg`);
        }
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setReceiptUri(result.assets[0].uri);
        setReceiptName(result.assets[0].name ?? `receipt-${Date.now()}`);
      }
    } catch {
      setError('Could not attach receipt.');
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!loanId) {
      setError('Select a loan');
      return;
    }
    if (amountMinor == null || amountMinor <= 0) {
      setError('Enter a valid MWK amount');
      return;
    }
    if (!receiptNumber.trim()) {
      setError('Deposit receipt number is required');
      return;
    }
    if (!paymentDate.trim()) {
      setError('Payment date is required');
      return;
    }
    if (!receiptUri) {
      setError('Deposit receipt upload is required');
      return;
    }

    setSubmitting(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) throw new Error('Not signed in');
      const result = await submitCustomerRepayment({
        loan_id: loanId,
        amount_minor: amountMinor,
        deposit_receipt_number: receiptNumber.trim(),
        payment_date: paymentDate.trim(),
        payment_method: 'GROUP_CHAIRPERSON_DEPOSIT',
        recorded_by_member_id: memberId,
        receipt_local_uri: receiptUri,
        receipt_file_name: receiptName ?? undefined,
        receipt_prefix: 'group-receipts',
      });
      if ('status' in result && result.status === 'QUEUED_OFFLINE') {
        Alert.alert(
          'Queued offline',
          `${formatMinorMWK(amountMinor)} for ${memberName} will submit when you are back online.`
        );
      } else {
        Alert.alert(
          'Repayment submitted',
          `${formatMinorMWK(amountMinor)} for ${memberName} was submitted for review.`
        );
      }
      reset();
      onClose();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record repayment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ClientModalShell
      visible={visible}
      title="Record member repayment"
      subtitle={memberName}
      icon="payments"
      onClose={() => {
        if (!submitting) {
          reset();
          onClose();
        }
      }}
      scrollable
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={Platform.OS === 'android'}
        contentContainerStyle={styles.body}
      >
        <ThemedText style={styles.help}>
          Submit a deposit-style repayment for this member. Operations verify before it posts to the
          loan.
        </ThemedText>

        <ThemedText type="defaultSemiBold" style={styles.label}>
          Loan
        </ThemedText>
        {loansLoading ? (
          <ActivityIndicator color={ClientUI.colors.primary} />
        ) : loans.length === 0 ? (
          <ThemedText style={styles.muted}>No active loans for this member.</ThemedText>
        ) : (
          <View style={styles.chipCol}>
            {loans.map((loan) => {
              const selected = loanId === loan.id;
              const share =
                loan.my_share_outstanding_minor ??
                loan.outstanding_principal + loan.outstanding_interest;
              return (
                <Pressable
                  key={loan.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setLoanId(loan.id)}
                >
                  <ThemedText style={[styles.chipTitle, selected && styles.chipTitleSelected]}>
                    {loan.loan_account_number ?? `Loan #${loan.id}`}
                  </ThemedText>
                  <ThemedText style={styles.chipMeta}>
                    Outstanding {formatMinorMWK(share)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        )}

        {selectedLoan && outstanding > 0 ? (
          <ThemedText style={styles.muted}>
            Member outstanding: {formatMinorMWK(outstanding)}
          </ThemedText>
        ) : null}

        <MwkMoneyInput
          label="Amount (MWK)"
          valueMinor={amountMinor}
          onChangeMinor={setAmountMinor}
        />

        <ThemedText type="defaultSemiBold" style={styles.label}>
          Deposit receipt number
        </ThemedText>
        <TextInput
          style={clientModalStyles.input}
          value={receiptNumber}
          onChangeText={setReceiptNumber}
          placeholder="Receipt / slip number"
          placeholderTextColor={ClientUI.colors.textMuted}
          autoCapitalize="characters"
        />

        <ThemedText type="defaultSemiBold" style={styles.label}>
          Payment date (YYYY-MM-DD)
        </ThemedText>
        <TextInput
          style={clientModalStyles.input}
          value={paymentDate}
          onChangeText={setPaymentDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={ClientUI.colors.textMuted}
          autoCapitalize="none"
        />

        <ThemedText type="defaultSemiBold" style={styles.label}>
          Receipt upload
        </ThemedText>
        <View style={styles.receiptRow}>
          <Pressable style={styles.receiptBtn} onPress={() => void pickReceipt(true)}>
            <MaterialIcons name="photo-camera" size={18} color={ClientUI.colors.primary} />
            <ThemedText style={styles.receiptBtnText}>Camera</ThemedText>
          </Pressable>
          <Pressable style={styles.receiptBtn} onPress={() => void pickReceipt(false)}>
            <MaterialIcons name="attach-file" size={18} color={ClientUI.colors.primary} />
            <ThemedText style={styles.receiptBtnText}>File</ThemedText>
          </Pressable>
        </View>
        {receiptName ? (
          <ThemedText style={styles.muted}>Attached: {receiptName}</ThemedText>
        ) : (
          <ThemedText style={styles.muted}>Receipt image or PDF is required.</ThemedText>
        )}

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

        <Pressable
          style={[styles.submit, submitting && styles.submitDisabled]}
          onPress={() => void handleSubmit()}
          disabled={submitting || loansLoading || loans.length === 0}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.submitText}>Submit for review</ThemedText>
          )}
        </Pressable>
      </ScrollView>
    </ClientModalShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 28, gap: 8 },
  help: { fontSize: 13, color: ClientUI.colors.textMuted, lineHeight: 18, marginBottom: 8 },
  label: { marginTop: 8, marginBottom: 4, fontSize: 13 },
  muted: { fontSize: 12, color: ClientUI.colors.textMuted, marginBottom: 4 },
  chipCol: { gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: ClientUI.colors.borderLight,
    borderRadius: 12,
    padding: 12,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  chipSelected: {
    borderColor: ClientUI.colors.primary,
    backgroundColor: 'rgba(10,61,122,0.08)',
  },
  chipTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.text },
  chipTitleSelected: { color: ClientUI.colors.primary },
  chipMeta: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2 },
  receiptRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  receiptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.borderLight,
    backgroundColor: ClientUI.colors.surfaceMuted,
  },
  receiptBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: ClientUI.colors.primary },
  error: { color: ClientUI.colors.danger, fontSize: 13, marginTop: 8 },
  submit: {
    marginTop: 16,
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontFamily: Fonts.sansSemiBold, fontSize: 15 },
});
