/**
 * AirtelRepayModal – borrower self-service "Repay with Airtel Money"
 * (Phase 7.8 mobile). Collects amount + MSISDN, initiates a collection via the
 * client-authenticated endpoint (POST /customer/airtel/repay), then polls
 * status until SUCCESS/FAILED.
 *
 * The borrower is already on their handset, so the primary flow is the Airtel
 * STK push. The collection reference is surfaced as an offline reference so the
 * borrower can complete the payment via USSD if the push is missed;
 * reconciliation always matches on the reference.
 *
 * Talks to FastAPI directly (no BFF) with the client JWT from the auth store,
 * matching the rest of the mobile app.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientModalShell, clientModalStyles } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { config } from '@/lib/config';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

interface RepayLoan {
  id: number;
  loan_account_number?: string;
  outstanding_principal?: number;
}

interface RepayResponse {
  reference: string;
  status: string;
  amount_minor?: number;
  msisdn?: string | null;
}

interface StatusResponse {
  reference: string;
  status: string;
  gl_posted?: boolean;
  failure_reason?: string | null;
}

interface AirtelRepayModalProps {
  loan: RepayLoan;
  visible: boolean;
  defaultMsisdn?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

type Phase = 'form' | 'pending' | 'success' | 'failed';

export function AirtelRepayModal({
  loan,
  visible,
  defaultMsisdn,
  onClose,
  onSuccess,
}: AirtelRepayModalProps) {
  const token = useAuthStore((s) => s.token);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [msisdn, setMsisdn] = useState(defaultMsisdn ?? '');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const startPolling = useCallback(
    (ref: string) => {
      clearPoll();
      pollRef.current = setInterval(async () => {
        try {
          const s = await api.get<StatusResponse>(config.airtel.repayStatus(ref), token);
          const st = (s.status || '').toUpperCase();
          if (st === 'SUCCESS') {
            clearPoll();
            setPhase('success');
            onSuccess?.();
          } else if (st === 'FAILED' || st === 'REVERSED') {
            clearPoll();
            setError(s.failure_reason || 'Payment failed. Please try again.');
            setPhase('failed');
          }
        } catch {
          /* transient — keep polling */
        }
      }, 4000);
    },
    [clearPoll, onSuccess, token]
  );

  const submit = async () => {
    setError(null);
    if (amountMinor == null || amountMinor <= 0) {
      setError('Enter a valid MWK amount.');
      return;
    }
    if (!msisdn.trim()) {
      setError('Enter the Airtel number to pay from.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<RepayResponse>(
        config.airtel.repay,
        { loan_id: loan.id, amount_minor: amountMinor, msisdn: msisdn.trim() },
        token
      );
      setReference(res.reference);
      setPhase('pending');
      startPolling(res.reference);
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.message : 'Failed to initiate payment. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    clearPoll();
    setPhase('form');
    setAmountMinor(null);
    setReference(null);
    setError(null);
    onClose();
  };

  const loanSubtitle = `${loan.loan_account_number ? `Loan ${loan.loan_account_number}` : `Loan #${loan.id}`}${
    loan.outstanding_principal != null ? ` · ${formatMinorMWK(loan.outstanding_principal)} outstanding` : ''
  }`;

  return (
    <ClientModalShell
      visible={visible}
      title="Airtel Money"
      subtitle={loanSubtitle}
      icon="smartphone"
      onClose={handleClose}
    >
      {phase === 'form' && (
        <View>
          <MwkMoneyInput
            label="Amount"
            valueMinor={amountMinor}
            onChangeMinor={setAmountMinor}
            placeholder="MWK 0"
          />
          <ThemedText style={clientModalStyles.label}>Airtel number</ThemedText>
          <TextInput
            style={clientModalStyles.input}
            keyboardType="phone-pad"
            placeholder="e.g. +265991234567"
            placeholderTextColor="#9ca3af"
            value={msisdn}
            onChangeText={setMsisdn}
          />
          <ThemedText style={clientModalStyles.hint}>
            Use your registered Airtel line, or enter another Airtel number to pay from.
          </ThemedText>
          {error ? <ThemedText style={clientModalStyles.error}>{error}</ThemedText> : null}
          <TouchableOpacity
            style={[clientModalStyles.primaryBtn, submitting && clientModalStyles.btnDisabled]}
            onPress={submit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <ThemedText style={clientModalStyles.primaryBtnText}>Request payment</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      )}

      {phase === 'pending' && reference && (
        <View>
          <View style={[clientModalStyles.alertBox, clientModalStyles.alertPending]}>
            <ActivityIndicator size="small" color="#b45309" />
            <ThemedText style={[clientModalStyles.alertText, { color: '#92400e' }]}>
              Approve the prompt on your Airtel line to complete the payment.
            </ThemedText>
          </View>
          <ThemedText style={clientModalStyles.label}>Payment reference</ThemedText>
          <ThemedText selectable style={styles.reference}>{reference}</ThemedText>
          <ThemedText style={clientModalStyles.hint}>
            If you miss the prompt, use this reference via Airtel Money USSD. We confirm automatically once received.
          </ThemedText>
          <TouchableOpacity style={clientModalStyles.secondaryBtn} onPress={handleClose} activeOpacity={0.8}>
            <ThemedText style={clientModalStyles.secondaryBtnText}>Close</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'success' && (
        <View>
          <View style={[clientModalStyles.alertBox, clientModalStyles.alertSuccess]}>
            <MaterialIcons name="check-circle" size={22} color="#047857" />
            <ThemedText style={[clientModalStyles.alertText, { color: '#065f46' }]}>
              Payment received. Your repayment is being posted to your loan.
            </ThemedText>
          </View>
          <TouchableOpacity style={clientModalStyles.primaryBtn} onPress={handleClose} activeOpacity={0.8}>
            <ThemedText style={clientModalStyles.primaryBtnText}>Done</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'failed' && (
        <View>
          <View style={[clientModalStyles.alertBox, clientModalStyles.alertFailed]}>
            <MaterialIcons name="error-outline" size={22} color="#b91c1c" />
            <ThemedText style={[clientModalStyles.alertText, { color: '#991b1b' }]}>{error || 'Payment failed.'}</ThemedText>
          </View>
          <TouchableOpacity
            style={clientModalStyles.primaryBtn}
            onPress={() => { setPhase('form'); setError(null); }}
            activeOpacity={0.8}
          >
            <ThemedText style={clientModalStyles.primaryBtnText}>Try again</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={clientModalStyles.secondaryBtn} onPress={handleClose} activeOpacity={0.8}>
            <ThemedText style={clientModalStyles.secondaryBtnText}>Close</ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </ClientModalShell>
  );
}

const styles = StyleSheet.create({
  reference: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});

export default AirtelRepayModal;
