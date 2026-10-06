/**
 * ClientRepaymentModal – dedicated borrower repayment for one loan.
 * Schedule (or free amount) + Airtel / Mpamba / Custom method cards.
 * Custom submits via POST /customer/repayments (pending ops verification).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ClientModalShell, clientModalStyles } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ApiClientError, api } from '@/lib/api-client';
import { config } from '@/lib/config';
import {
  apiCreateMobileRepayment,
  apiGetCustomerInstallmentSelection,
  apiTnmMpambaRepay,
  apiTnmMpambaStatus,
  type ApiScheduleItem,
  type InstallmentSelectionOptions,
} from '@/lib/data/api';
import { getLoanSchedule, getMobileLoanRepaymentSchedule, submitCustomerRepayment } from '@/lib/data';
import { buildInstallmentAllocationPlan } from '@/lib/loan-origination/installment-allocation';
import { pickKycMedia } from '@/lib/media/pick-kyc-media';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { loanOutstandingForViewer } from '@/lib/loan-origination/group-share-display';
import {
  installmentRemaining,
  isInstallmentOpen,
} from '@/lib/staff-repayment-schedule';
import { getStoredAuth } from '@/lib/storage';
import type { Loan } from '@/store';
import { useAuthStore } from '@/store/auth';
import { useClientSessionStore } from '@/store/client-session';

type PayMethod = 'airtel' | 'mpamba' | 'custom' | 'group_chair' | null;
type Phase = 'form' | 'pending' | 'success' | 'failed';

interface ClientRepaymentModalProps {
  visible: boolean;
  loan: Loan | null;
  onClose: () => void;
  onSuccess?: () => void;
}

type StatusResponse = {
  reference: string;
  status: string;
  gl_posted?: boolean;
  failure_reason?: string | null;
};

async function loadClientSchedule(loanId: number): Promise<ApiScheduleItem[]> {
  try {
    const mobile = await getMobileLoanRepaymentSchedule(loanId);
    if (mobile.length > 0) {
      return mobile.map((row) => ({
        id: row.id,
        installment_number: row.installment_number,
          due_date: String(row.due_date ?? ''),
          principal_amount: row.principal_amount,
          interest_amount: row.interest_amount,
          total_amount: row.total_amount,
          paid_amount: row.paid_amount,
          status: row.status,
        }));
      }
    } catch {
      /* fall through to staff-shaped schedule endpoint */
    }
  try {
    return (await getLoanSchedule(loanId)) ?? [];
  } catch {
    return [];
  }
}

export function ClientRepaymentModal({
  visible,
  loan,
  onClose,
  onSuccess,
}: ClientRepaymentModalProps) {
  const defaultMsisdn = useAuthStore((s) => s.user?.phoneNumber ?? '');
  const session = useClientSessionStore((s) => s.session);
  const canRecordGroup =
    session?.can_record_group_repayments === true || session?.is_group_chairperson === true;
  const [schedule, setSchedule] = useState<ApiScheduleItem[]>([]);
  const [installmentOptions, setInstallmentOptions] = useState<InstallmentSelectionOptions | null>(
    null
  );
  const [multiInstallmentMode, setMultiInstallmentMode] = useState(false);
  const [selectedInstallmentIds, setSelectedInstallmentIds] = useState<Set<number>>(new Set());
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<number | null>(null);
  const [selectedInstallmentNumber, setSelectedInstallmentNumber] = useState<number | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [method, setMethod] = useState<PayMethod>(null);
  const [msisdn, setMsisdn] = useState(defaultMsisdn);
  const [receiptRef, setReceiptRef] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [reference, setReference] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const reset = useCallback(() => {
    clearPoll();
    setSchedule([]);
    setInstallmentOptions(null);
    setMultiInstallmentMode(false);
    setSelectedInstallmentIds(new Set());
    setHasSchedule(false);
    setSelectedInstallmentId(null);
    setSelectedInstallmentNumber(null);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setReceiptUri(null);
    setReceiptName(null);
    setAmountMinor(null);
    setMethod(null);
    setMsisdn(defaultMsisdn);
    setReceiptRef('');
    setSubmitting(false);
    setError(null);
    setPhase('form');
    setReference(null);
  }, [clearPoll, defaultMsisdn]);

  useEffect(() => {
    if (!visible || !loan) {
      reset();
      return;
    }
    let cancelled = false;
    (async () => {
      setScheduleLoading(true);
      setError(null);
      setMsisdn(defaultMsisdn);
      try {
        const auth = await getStoredAuth();
        if (auth?.token) {
          try {
            const options = await apiGetCustomerInstallmentSelection(auth.token, loan.id);
            if (cancelled) return;
            setInstallmentOptions(options);
            const unpaid = options.all_unpaid_installments ?? [];
            setHasSchedule(unpaid.length > 0);
            const def = options.default_installment;
            if (def) {
              setSelectedInstallmentId(def.id);
              setSelectedInstallmentNumber(def.installment_number);
              setSelectedInstallmentIds(new Set([def.id]));
              setAmountMinor(Number(def.remaining_amount ?? 0) || null);
            } else if (unpaid.length === 0) {
              const shareOut = loanOutstandingForViewer(loan);
              if (shareOut > 0) setAmountMinor(shareOut);
            }
            // Keep legacy schedule rows for mobile-money free-amount fallback.
            setSchedule([]);
            return;
          } catch {
            /* fall through to schedule endpoints */
          }
        }

        const items = await loadClientSchedule(loan.id);
        if (cancelled) return;
        const open = items.filter(isInstallmentOpen);
        setSchedule(items);
        setInstallmentOptions(null);
        setHasSchedule(open.length > 0);
        if (open.length === 1) {
          const only = open[0];
          setSelectedInstallmentNumber(only.installment_number);
          setSelectedInstallmentId(only.id ?? null);
          setAmountMinor(installmentRemaining(only));
        } else if (open.length === 0) {
          const shareOut = loanOutstandingForViewer(loan);
          if (shareOut > 0) setAmountMinor(shareOut);
        }
      } catch {
        if (!cancelled) {
          setSchedule([]);
          setInstallmentOptions(null);
          setHasSchedule(false);
          const shareOut = loanOutstandingForViewer(loan);
          if (shareOut > 0) setAmountMinor(shareOut);
        }
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, loan, reset, defaultMsisdn]);

  const handleClose = () => {
    if (submitting && phase === 'form') return;
    reset();
    onClose();
  };

  const startPolling = useCallback(
    (ref: string, provider: 'airtel' | 'mpamba') => {
      clearPoll();
      pollRef.current = setInterval(async () => {
        try {
          const auth = await getStoredAuth();
          if (!auth?.token) return;
          const s =
            provider === 'airtel'
              ? await api.get<StatusResponse>(config.airtel.repayStatus(ref), auth.token)
              : await apiTnmMpambaStatus(auth.token, ref);
          const st = (s?.status || '').toUpperCase();
          if (st === 'SUCCESS') {
            clearPoll();
            setPhase('success');
            onSuccess?.();
          } else if (st === 'FAILED' || st === 'REVERSED') {
            clearPoll();
            setError(
              (s && 'failure_reason' in s && s.failure_reason) ||
                'Payment failed. Please try again.'
            );
            setPhase('failed');
          }
        } catch {
          /* transient */
        }
      }, 4000);
    },
    [clearPoll, onSuccess]
  );

  const pickReceipt = async () => {
    try {
      const picked = await pickKycMedia('id');
      if (!picked?.uri) return;
      setReceiptUri(picked.uri);
      setReceiptName(picked.name || 'receipt.jpg');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not capture receipt.');
    }
  };

  const applyAllocationFromIds = useCallback(
    (ids: Set<number>) => {
      const unpaid = installmentOptions?.all_unpaid_installments ?? [];
      const plan = buildInstallmentAllocationPlan(unpaid, ids);
      if (plan.total > 0) setAmountMinor(plan.total);
      const firstId = ids.values().next().value as number | undefined;
      if (firstId != null) {
        setSelectedInstallmentId(firstId);
        const row = unpaid.find((r) => r.id === firstId);
        setSelectedInstallmentNumber(row?.installment_number ?? null);
      } else {
        setSelectedInstallmentId(null);
        setSelectedInstallmentNumber(null);
      }
      return plan;
    },
    [installmentOptions]
  );

  const handleMultiInstallmentToggle = (enabled: boolean) => {
    setMultiInstallmentMode(enabled);
    setError(null);
    if (!installmentOptions) return;
    if (enabled) {
      const allIds = new Set(installmentOptions.all_unpaid_installments.map((i) => i.id));
      setSelectedInstallmentIds(allIds);
      applyAllocationFromIds(allIds);
    } else {
      const def = installmentOptions.default_installment;
      if (def) {
        setSelectedInstallmentIds(new Set([def.id]));
        setSelectedInstallmentId(def.id);
        setSelectedInstallmentNumber(def.installment_number);
        setAmountMinor(Number(def.remaining_amount ?? 0) || null);
      } else {
        setSelectedInstallmentIds(new Set());
      }
    }
  };

  const toggleInstallmentSelection = (installmentId: number) => {
    setSelectedInstallmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(installmentId)) next.delete(installmentId);
      else next.add(installmentId);
      applyAllocationFromIds(next);
      return next;
    });
    setError(null);
  };

  const resolveSelectedInstallmentIds = (): number[] | undefined => {
    if (multiInstallmentMode) {
      const ids = Array.from(selectedInstallmentIds);
      return ids.length > 0 ? ids : undefined;
    }
    if (selectedInstallmentId != null) return [selectedInstallmentId];
    return undefined;
  };

  const resolveAllocationPlan = () => {
    if (!multiInstallmentMode || selectedInstallmentIds.size === 0 || !installmentOptions) {
      return null;
    }
    return buildInstallmentAllocationPlan(
      installmentOptions.all_unpaid_installments,
      selectedInstallmentIds
    );
  };

  const submitCustom = async (asGroupChair = false) => {
    if (!loan) return;
    if (amountMinor == null || amountMinor <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (!receiptRef.trim()) {
      setError('Enter the bank deposit / receipt number.');
      return;
    }
    if (multiInstallmentMode && selectedInstallmentIds.size === 0) {
      setError('Select at least one installment to pay.');
      return;
    }
    const allocationPlan = resolveAllocationPlan();
    if (multiInstallmentMode && allocationPlan && amountMinor < allocationPlan.total) {
      setError(
        `Amount must be at least ${formatMinorMWK(allocationPlan.total)} for the selected installments.`
      );
      return;
    }
    const cap = loanOutstandingForViewer(loan);
    if (cap > 0 && amountMinor > cap && !asGroupChair) {
      setError(
        loan.is_group_facility
          ? `Amount cannot exceed your share outstanding (${formatMinorMWK(cap)}).`
          : `Amount cannot exceed outstanding (${formatMinorMWK(cap)}).`
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        setError('Not signed in');
        return;
      }

      const selectedIds = resolveSelectedInstallmentIds();
      const receiptPrefix = asGroupChair ? 'group-receipts' : 'client-receipts';

      // Direct-deposit style path matches the web client portal (receipt + ops review).
      // Online-first with offline queue when the data link is down.
      const result = await submitCustomerRepayment({
        loan_id: loan.id,
        amount_minor: amountMinor,
        payment_method: asGroupChair ? 'GROUP_CHAIRPERSON_DEPOSIT' : 'CLIENT_DIRECT_DEPOSIT',
        deposit_receipt_number: receiptRef.trim(),
        payment_date: paymentDate.trim() || undefined,
        selected_installment_ids: selectedIds,
        installment_allocation_plan: allocationPlan,
        recorded_by_member_id:
          asGroupChair && session?.client_id != null && Number(session.client_id) > 0
            ? Number(session.client_id)
            : undefined,
        receipt_local_uri: receiptUri ?? undefined,
        receipt_file_name: receiptName || 'receipt.jpg',
        receipt_prefix: receiptPrefix,
      });
      if ('status' in result && result.status === 'QUEUED_OFFLINE') {
        Alert.alert(
          'Queued offline',
          `${formatMinorMWK(amountMinor)} will submit for ${loan.loan_account_number} when you are back online.`
        );
      } else {
        Alert.alert(
          'Payment recorded',
          `${formatMinorMWK(amountMinor)} submitted for ${loan.loan_account_number}. It will post to your loan after CoFi verifies and confirms it.`
        );
      }
      reset();
      onClose();
      onSuccess?.();
    } catch (e) {
      // Fall back to the mobile repayment endpoint if deposit fields are rejected online.
      try {
        const auth = await getStoredAuth();
        if (!auth?.token) throw e;
        await apiCreateMobileRepayment(auth.token, {
          loan_id: loan.id,
          total_amount: amountMinor,
          payment_method: 'MOBILE_APP',
          reference_number: receiptRef.trim() || undefined,
          selected_installment_ids: resolveSelectedInstallmentIds(),
        });
        Alert.alert(
          'Payment recorded',
          `${formatMinorMWK(amountMinor)} submitted. It will post after CoFi confirms it.`
        );
        reset();
        onClose();
        onSuccess?.();
      } catch (fallbackError) {
        setError(
          fallbackError instanceof ApiClientError
            ? fallbackError.message
            : e instanceof ApiClientError
              ? e.message
              : 'Failed to submit payment. Please try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitMobileMoney = async (provider: 'airtel' | 'mpamba') => {
    if (!loan) return;
    if (amountMinor == null || amountMinor <= 0) {
      setError('Enter a valid amount');
      return;
    }
    const cap = loanOutstandingForViewer(loan);
    if (cap > 0 && amountMinor > cap) {
      setError(
        loan.is_group_facility
          ? `Amount cannot exceed your share outstanding (${formatMinorMWK(cap)}).`
          : `Amount cannot exceed outstanding (${formatMinorMWK(cap)}).`
      );
      return;
    }
    if (!msisdn.trim()) {
      setError(
        provider === 'airtel'
          ? 'Enter the Airtel number to pay from.'
          : 'Enter the TNM Mpamba number to pay from.'
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        setError('Not signed in');
        return;
      }
      if (provider === 'airtel') {
        const res = await api.post<{ reference: string; status: string }>(
          config.airtel.repay,
          { loan_id: loan.id, amount_minor: amountMinor, msisdn: msisdn.trim() },
          auth.token
        );
        setReference(res.reference);
        setPhase('pending');
        startPolling(res.reference, 'airtel');
      } else {
        const res = await apiTnmMpambaRepay(auth.token, {
          loan_id: loan.id,
          amount_minor: amountMinor,
          msisdn: msisdn.trim(),
        });
        if (!res?.reference) {
          setError('Failed to initiate Mpamba payment.');
          setPhase('failed');
          return;
        }
        setReference(res.reference);
        setPhase('pending');
        startPolling(res.reference, 'mpamba');
      }
    } catch (e) {
      setError(
        e instanceof ApiClientError
          ? e.message
          : 'Failed to initiate payment. Please try again.'
      );
      setPhase('failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrimarySubmit = () => {
    if (method === 'custom') void submitCustom(false);
    else if (method === 'group_chair') void submitCustom(true);
    else if (method === 'airtel') void submitMobileMoney('airtel');
    else if (method === 'mpamba') void submitMobileMoney('mpamba');
    else setError('Select a payment method');
  };

  if (!loan) return null;

  const openInstallments = schedule.filter(isInstallmentOpen);
  const unpaidFromOptions = installmentOptions?.all_unpaid_installments ?? [];
  const allocationPreview =
    multiInstallmentMode && selectedInstallmentIds.size > 0 && installmentOptions
      ? buildInstallmentAllocationPlan(unpaidFromOptions, selectedInstallmentIds)
      : null;
  const viewerOutstanding = loanOutstandingForViewer(loan);
  const subtitle = `${loan.loan_account_number}${
    viewerOutstanding > 0
      ? ` · ${formatMinorMWK(viewerOutstanding)}${
          loan.is_group_facility ? ' your share' : ''
        } outstanding`
      : ''
  }`;

  return (
    <ClientModalShell
      visible={visible}
      title="Make a payment"
      subtitle={subtitle}
      icon="payment"
      onClose={handleClose}
      scrollable
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {phase === 'form' && (
          <>
            {scheduleLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={ClientUIPrimary} />
                <ThemedText style={clientModalStyles.hint}>Loading schedule…</ThemedText>
              </View>
            ) : installmentOptions && unpaidFromOptions.length > 0 ? (
              <View>
                <ThemedText style={clientModalStyles.label}>Repayment schedule</ThemedText>
                {!multiInstallmentMode && installmentOptions.default_installment ? (
                  <View style={[styles.scheduleRow, styles.scheduleRowSelected]}>
                    <View style={styles.scheduleNum}>
                      <ThemedText style={styles.scheduleNumText}>
                        {installmentOptions.default_installment.installment_number}
                      </ThemedText>
                    </View>
                    <View style={styles.scheduleMid}>
                      <ThemedText style={styles.scheduleDate}>
                        Next due {(installmentOptions.default_installment.due_date || '').slice(0, 10)}
                      </ThemedText>
                      <ThemedText style={styles.scheduleAmount}>
                        {formatMinorMWK(
                          Number(installmentOptions.default_installment.remaining_amount ?? 0)
                        )}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.scheduleStatus}>
                      {installmentOptions.default_installment.status || 'pending'}
                    </ThemedText>
                  </View>
                ) : null}

                {unpaidFromOptions.length > 1 ? (
                  <TouchableOpacity
                    style={styles.multiToggle}
                    onPress={() => handleMultiInstallmentToggle(!multiInstallmentMode)}
                    activeOpacity={0.75}
                    disabled={submitting}
                  >
                    <MaterialIcons
                      name={multiInstallmentMode ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={ClientUIPrimary}
                    />
                    <ThemedText style={styles.multiToggleText}>
                      Pay multiple installments
                    </ThemedText>
                  </TouchableOpacity>
                ) : null}

                {multiInstallmentMode ? (
                  <View style={styles.scheduleList}>
                    <ThemedText style={clientModalStyles.hint}>
                      Select installments to include in this payment.
                    </ThemedText>
                    {unpaidFromOptions.map((item) => {
                      const remaining = Number(item.remaining_amount ?? item.total_amount ?? 0);
                      const selected = selectedInstallmentIds.has(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.scheduleRow, selected && styles.scheduleRowSelected]}
                          onPress={() => toggleInstallmentSelection(item.id)}
                          activeOpacity={0.7}
                          disabled={submitting}
                        >
                          <MaterialIcons
                            name={selected ? 'check-box' : 'check-box-outline-blank'}
                            size={22}
                            color={selected ? ClientUIPrimary : '#9ca3af'}
                          />
                          <View style={styles.scheduleNum}>
                            <ThemedText style={styles.scheduleNumText}>
                              {item.installment_number}
                            </ThemedText>
                          </View>
                          <View style={styles.scheduleMid}>
                            <ThemedText style={styles.scheduleDate}>
                              {(item.due_date || '').slice(0, 10)}
                            </ThemedText>
                            <ThemedText style={styles.scheduleAmount}>
                              {formatMinorMWK(remaining)}
                            </ThemedText>
                          </View>
                          <ThemedText style={styles.scheduleStatus}>
                            {item.status || 'pending'}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                {allocationPreview && allocationPreview.total > 0 ? (
                  <View style={styles.allocationBox}>
                    <ThemedText style={styles.allocationTitle}>Allocation plan</ThemedText>
                    <ThemedText style={styles.allocationLine}>
                      Principal {formatMinorMWK(allocationPreview.principal)}
                    </ThemedText>
                    <ThemedText style={styles.allocationLine}>
                      Interest {formatMinorMWK(allocationPreview.interest)}
                    </ThemedText>
                    <ThemedText style={styles.allocationLine}>
                      Penalty {formatMinorMWK(allocationPreview.penalty)}
                    </ThemedText>
                    <ThemedText style={styles.allocationTotal}>
                      Total {formatMinorMWK(allocationPreview.total)}
                    </ThemedText>
                  </View>
                ) : null}

                <MwkMoneyInput
                  label="Amount"
                  valueMinor={amountMinor}
                  onChangeMinor={(minor) => {
                    setAmountMinor(minor);
                    setError(null);
                  }}
                  placeholder="MWK 0"
                  disabled={submitting}
                />
                {multiInstallmentMode && allocationPreview ? (
                  <ThemedText style={clientModalStyles.hint}>
                    Minimum for selected installments: {formatMinorMWK(allocationPreview.total)}
                  </ThemedText>
                ) : null}
              </View>
            ) : hasSchedule ? (
              <View>
                <ThemedText style={clientModalStyles.label}>Repayment schedule</ThemedText>
                <ThemedText style={clientModalStyles.hint}>
                  Tap an installment to set the amount.
                </ThemedText>
                <View style={styles.scheduleList}>
                  {openInstallments.map((item) => {
                    const remaining = installmentRemaining(item);
                    const selected =
                      selectedInstallmentNumber === item.installment_number ||
                      (item.id != null && selectedInstallmentId === item.id);
                    return (
                      <TouchableOpacity
                        key={`${item.installment_number}-${item.due_date}-${item.id ?? 'x'}`}
                        style={[styles.scheduleRow, selected && styles.scheduleRowSelected]}
                        onPress={() => {
                          setSelectedInstallmentNumber(item.installment_number);
                          setSelectedInstallmentId(item.id ?? null);
                          setSelectedInstallmentIds(
                            item.id != null ? new Set([item.id]) : new Set()
                          );
                          setAmountMinor(remaining);
                          setError(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.scheduleNum}>
                          <ThemedText style={styles.scheduleNumText}>
                            {item.installment_number}
                          </ThemedText>
                        </View>
                        <View style={styles.scheduleMid}>
                          <ThemedText style={styles.scheduleDate}>
                            {(item.due_date || '').slice(0, 10)}
                          </ThemedText>
                          <ThemedText style={styles.scheduleAmount}>
                            {formatMinorMWK(remaining)}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.scheduleStatus}>{item.status}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <MwkMoneyInput
                  label="Amount"
                  valueMinor={amountMinor}
                  onChangeMinor={(minor) => {
                    setAmountMinor(minor);
                    setError(null);
                  }}
                  placeholder="MWK 0"
                  disabled={submitting}
                />
              </View>
            ) : (
              <View>
                <ThemedText style={clientModalStyles.hint}>
                  No repayment schedule on this loan. Enter the amount to pay.
                </ThemedText>
                <MwkMoneyInput
                  label="Amount"
                  valueMinor={amountMinor}
                  onChangeMinor={(minor) => {
                    setAmountMinor(minor);
                    setError(null);
                  }}
                  placeholder="MWK 0"
                  disabled={submitting}
                />
              </View>
            )}

            <ThemedText style={[clientModalStyles.label, { marginTop: 16 }]}>
              Payment method
            </ThemedText>
            <View style={styles.methodRow}>
              <MethodCard
                icon="smartphone"
                label="Airtel Money"
                selected={method === 'airtel'}
                onPress={() => {
                  setMethod('airtel');
                  setError(null);
                }}
              />
              <MethodCard
                icon="phone-android"
                label="TNM Mpamba"
                selected={method === 'mpamba'}
                onPress={() => {
                  setMethod('mpamba');
                  setError(null);
                }}
              />
              <MethodCard
                icon="receipt-long"
                label="Bank deposit"
                selected={method === 'custom'}
                onPress={() => {
                  setMethod('custom');
                  setError(null);
                }}
              />
              {canRecordGroup ? (
                <MethodCard
                  icon="groups"
                  label="Group deposit"
                  selected={method === 'group_chair'}
                  onPress={() => {
                    setMethod('group_chair');
                    setError(null);
                  }}
                />
              ) : null}
            </View>

            {(method === 'airtel' || method === 'mpamba') && (
              <View style={{ marginTop: 14 }}>
                <ThemedText style={clientModalStyles.label}>
                  {method === 'airtel' ? 'Airtel number' : 'TNM Mpamba number'}
                </ThemedText>
                <TextInput
                  style={clientModalStyles.input}
                  keyboardType="phone-pad"
                  placeholder="e.g. +265991234567"
                  placeholderTextColor="#9ca3af"
                  value={msisdn}
                  onChangeText={setMsisdn}
                  editable={!submitting}
                />
                <ThemedText style={clientModalStyles.hint}>
                  You will receive a payment prompt on this number.
                </ThemedText>
              </View>
            )}

            {method === 'custom' || method === 'group_chair' ? (
              <View style={{ marginTop: 14, gap: 8 }}>
                <ThemedText style={clientModalStyles.label}>Deposit receipt number *</ThemedText>
                <TextInput
                  style={clientModalStyles.input}
                  placeholder="Bank slip / receipt number"
                  placeholderTextColor="#9ca3af"
                  value={receiptRef}
                  onChangeText={setReceiptRef}
                  editable={!submitting}
                />
                <ThemedText style={clientModalStyles.label}>Payment date</ThemedText>
                <TextInput
                  style={clientModalStyles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                  value={paymentDate}
                  onChangeText={setPaymentDate}
                  editable={!submitting}
                  autoCapitalize="none"
                />
                <ThemedText style={clientModalStyles.label}>Receipt photo (recommended)</ThemedText>
                <TouchableOpacity
                  style={styles.receiptBtn}
                  onPress={() => void pickReceipt()}
                  disabled={submitting}
                >
                  <MaterialIcons name="photo-camera" size={18} color="#0a3d7a" />
                  <ThemedText style={styles.receiptBtnText}>
                    {receiptName ? 'Change receipt photo' : 'Add receipt photo'}
                  </ThemedText>
                </TouchableOpacity>
                {receiptName ? (
                  <ThemedText style={clientModalStyles.hint}>Attached: {receiptName}</ThemedText>
                ) : null}
                <ThemedText style={clientModalStyles.hint}>
                  {method === 'group_chair'
                    ? 'Group chair deposits are reviewed by operations before posting.'
                    : 'Direct deposits are reviewed by operations before posting to your loan.'}
                </ThemedText>
              </View>
            ) : null}

            {error ? <ThemedText style={clientModalStyles.error}>{error}</ThemedText> : null}

            <TouchableOpacity
              style={[
                clientModalStyles.primaryBtn,
                (!method || !amountMinor || submitting) && clientModalStyles.btnDisabled,
              ]}
              onPress={handlePrimarySubmit}
              disabled={!method || !amountMinor || submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={clientModalStyles.primaryBtnText}>
                  {method === 'custom' || method === 'group_chair'
                    ? 'Submit deposit'
                    : method === 'airtel'
                      ? 'Request Airtel payment'
                      : method === 'mpamba'
                        ? 'Request Mpamba payment'
                        : 'Continue'}
                </ThemedText>
              )}
            </TouchableOpacity>
          </>
        )}

        {phase === 'pending' && reference ? (
          <View>
            <View style={[clientModalStyles.alertBox, clientModalStyles.alertPending]}>
              <ActivityIndicator size="small" color="#b45309" />
              <ThemedText style={[clientModalStyles.alertText, { color: '#92400e' }]}>
                Approve the prompt on your phone to complete the payment.
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
                setReference(null);
              }}
            >
              <ThemedText style={clientModalStyles.primaryBtnText}>Try again</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={clientModalStyles.secondaryBtn} onPress={handleClose}>
              <ThemedText style={clientModalStyles.secondaryBtnText}>Close</ThemedText>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </ClientModalShell>
  );
}

const ClientUIPrimary = '#0a3d7a';

function MethodCard({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.methodCard, selected && styles.methodCardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <MaterialIcons name={icon} size={22} color={selected ? ClientUIPrimary : '#6b7280'} />
      <ThemedText style={[styles.methodLabel, selected && styles.methodLabelSelected]}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 520 },
  scrollContent: { paddingBottom: 24 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  scheduleList: { gap: 8, marginBottom: 12 },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  scheduleRowSelected: {
    borderColor: ClientUIPrimary,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  multiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
    paddingVertical: 6,
  },
  multiToggleText: { fontSize: 13, fontWeight: '600', color: ClientUIPrimary },
  allocationBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(10,61,122,0.25)',
    backgroundColor: 'rgba(10,61,122,0.05)',
    gap: 4,
  },
  allocationTitle: { fontSize: 13, fontWeight: '700', color: ClientUIPrimary, marginBottom: 2 },
  allocationLine: { fontSize: 12, opacity: 0.8 },
  allocationTotal: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  scheduleNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleNumText: { fontSize: 12, fontWeight: '700', color: ClientUIPrimary },
  scheduleMid: { flex: 1, minWidth: 0 },
  scheduleDate: { fontSize: 13, fontWeight: '600' },
  scheduleAmount: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  scheduleStatus: { fontSize: 11, opacity: 0.65, textTransform: 'capitalize' },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodCard: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 72,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  methodCardSelected: {
    borderColor: ClientUIPrimary,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  methodLabel: { fontSize: 11, textAlign: 'center', color: '#4b5563', fontWeight: '600' },
  methodLabelSelected: { color: ClientUIPrimary },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  receiptBtnText: { fontSize: 13, fontWeight: '600', color: ClientUIPrimary },
  reference: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
});

export default ClientRepaymentModal;
