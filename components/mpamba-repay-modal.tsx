/**
 * Client Mpamba repay – initiates TNM collection and polls until SUCCESS/FAILED.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientModalShell, clientModalStyles } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ClientUI } from '@/constants/client-ui';
import { ApiClientError } from '@/lib/api-client';
import { apiTnmMpambaRepay, apiTnmMpambaStatus } from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';

interface Props {
  visible: boolean;
  onClose: () => void;
  loanId: number;
  loanAccountNumber?: string;
  outstandingAmount?: number;
  onRepaid?: () => void;
}

type Phase = 'form' | 'pending' | 'success' | 'failed';

export function MpambaRepayModal({
  visible,
  onClose,
  loanId,
  loanAccountNumber,
  outstandingAmount,
  onRepaid,
}: Props) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  useEffect(() => {
    if (!visible) {
      clearPoll();
      setPhase('form');
      setAmountMinor(null);
      setReference(null);
      setError(null);
      setPhoneNumber('');
    }
  }, [visible, clearPoll]);

  const startPolling = useCallback(
    (ref: string) => {
      clearPoll();
      pollRef.current = setInterval(async () => {
        try {
          const auth = await getStoredAuth();
          if (!auth?.token) return;
          const s = await apiTnmMpambaStatus(auth.token, ref);
          const st = (s?.status || '').toUpperCase();
          if (st === 'SUCCESS') {
            clearPoll();
            setPhase('success');
            onRepaid?.();
          } else if (st === 'FAILED' || st === 'REVERSED') {
            clearPoll();
            setError(s?.failure_reason || 'Payment failed. Please try again.');
            setPhase('failed');
          }
        } catch {
          /* transient */
        }
      }, 4000);
    },
    [clearPoll, onRepaid]
  );

  const handleRepay = async () => {
    setError(null);
    if (!phoneNumber.trim()) {
      setError('Enter phone number and amount.');
      return;
    }
    if (amountMinor == null || amountMinor <= 0) {
      setError('Enter a valid MWK amount.');
      return;
    }
    setSubmitting(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        setError('Not signed in');
        return;
      }
      const result = await apiTnmMpambaRepay(auth.token, {
        loan_id: loanId,
        amount_minor: amountMinor,
        msisdn: phoneNumber.trim(),
      });
      if (!result?.reference) {
        setError('Failed to initiate Mpamba repayment.');
        return;
      }
      setReference(result.reference);
      setPhase('pending');
      startPolling(result.reference);
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.message : 'Mpamba repayment failed. Please try again.'
      );
      setPhase('failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    clearPoll();
    onClose();
  };

  const subtitle = loanAccountNumber
    ? `Loan ${loanAccountNumber}${outstandingAmount ? ` · ${formatMinorMWK(outstandingAmount)}` : ''}`
    : undefined;

  return (
    <ClientModalShell
      visible={visible}
      title="TNM Mpamba"
      subtitle={subtitle}
      icon="phone-android"
      onClose={handleClose}
    >
      {phase === 'form' && (
        <View>
          <ThemedText style={clientModalStyles.label}>TNM phone number</ThemedText>
          <TextInput
            style={clientModalStyles.input}
            placeholder="e.g. 0888123456"
            keyboardType="phone-pad"
            placeholderTextColor={ClientUI.colors.textSubtle}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />

          <MwkMoneyInput
            label={outstandingAmount ? `Amount (max ${formatMinorMWK(outstandingAmount)})` : 'Amount'}
            valueMinor={amountMinor}
            onChangeMinor={setAmountMinor}
            placeholder="MWK 0"
          />

          {error ? <ThemedText style={clientModalStyles.error}>{error}</ThemedText> : null}

          <TouchableOpacity
            style={[styles.payBtn, submitting && clientModalStyles.btnDisabled]}
            onPress={handleRepay}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="send" size={18} color="#fff" />
                <ThemedText style={styles.payBtnText}>Pay with Mpamba</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {phase === 'pending' && reference ? (
        <View>
          <View style={[clientModalStyles.alertBox, clientModalStyles.alertPending]}>
            <ActivityIndicator size="small" color="#b45309" />
            <ThemedText style={[clientModalStyles.alertText, { color: '#92400e' }]}>
              Approve the prompt on your TNM line to complete the payment.
            </ThemedText>
          </View>
          <ThemedText style={clientModalStyles.label}>Payment reference</ThemedText>
          <ThemedText selectable style={styles.reference}>
            {reference}
          </ThemedText>
          <TouchableOpacity style={clientModalStyles.secondaryBtn} onPress={handleClose}>
            <ThemedText style={clientModalStyles.secondaryBtnText}>Close</ThemedText>
          </TouchableOpacity>
        </View>
      ) : null}

      {phase === 'success' ? (
        <View>
          <View style={[clientModalStyles.alertBox, clientModalStyles.alertSuccess]}>
            <MaterialIcons name="check-circle" size={22} color="#047857" />
            <ThemedText style={[clientModalStyles.alertText, { color: '#065f46' }]}>
              Payment received. Your repayment is being posted to your loan.
            </ThemedText>
          </View>
          <TouchableOpacity style={clientModalStyles.primaryBtn} onPress={handleClose}>
            <ThemedText style={clientModalStyles.primaryBtnText}>Done</ThemedText>
          </TouchableOpacity>
        </View>
      ) : null}

      {phase === 'failed' ? (
        <View>
          <View style={[clientModalStyles.alertBox, clientModalStyles.alertFailed]}>
            <MaterialIcons name="error-outline" size={22} color="#b91c1c" />
            <ThemedText style={[clientModalStyles.alertText, { color: '#991b1b' }]}>
              {error || 'Payment failed.'}
            </ThemedText>
          </View>
          <TouchableOpacity
            style={clientModalStyles.primaryBtn}
            onPress={() => {
              setPhase('form');
              setError(null);
            }}
          >
            <ThemedText style={clientModalStyles.primaryBtnText}>Try again</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={clientModalStyles.secondaryBtn} onPress={handleClose}>
            <ThemedText style={clientModalStyles.secondaryBtnText}>Close</ThemedText>
          </TouchableOpacity>
        </View>
      ) : null}
    </ClientModalShell>
  );
}

const styles = StyleSheet.create({
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.accent,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 16,
    ...ClientUI.shadows.action,
  },
  payBtnText: { color: ClientUI.colors.primaryDeep, fontWeight: '700', fontSize: 16 },
  reference: {
    fontSize: 14,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
});
