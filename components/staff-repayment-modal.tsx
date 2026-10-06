/**
 * StaffRepaymentModal – dedicated repayment for one selected loan.
 * Shows schedule (or free amount), then Airtel / Mpamba / Custom method cards.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { ApiClientError } from '@/lib/api-client';
import {
  apiStaffAirtelCollectionInitiate,
  apiStaffAirtelCollectionStatus,
  apiStaffTnmCollectionInitiate,
  apiStaffTnmCollectionStatus,
} from '@/lib/data/api';
import type { ApiScheduleItem } from '@/lib/data/api';
import { getClient, getGroupMembers, getLoanSchedule } from '@/lib/data';
import { isGroupParentClient } from '@/lib/group-client';
import type { ClientRow } from '@/lib/data/types';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';
import {
  installmentRemaining,
  isInstallmentOpen,
} from '@/lib/staff-repayment-schedule';
import type { Loan } from '@/store';
import { useAuthStore } from '@/store/auth';
import { useRepaymentsStore } from '@/store/repayments';

type PayMethod = 'airtel' | 'mpamba' | 'custom' | null;
type Phase = 'form' | 'pending' | 'success' | 'failed';

interface StaffRepaymentModalProps {
  visible: boolean;
  loan: Loan | null;
  onClose: () => void;
  onRecorded?: () => void;
}

export function StaffRepaymentModal({
  visible,
  loan,
  onClose,
  onRecorded,
}: StaffRepaymentModalProps) {
  const { recordRepayment } = useRepaymentsStore();
  const canAirtelCollect = useAuthStore((s) => s.hasPermission('airtel:collect'));
  const canTnmCollect = useAuthStore((s) => s.hasPermission('tnm:collect'));
  const [schedule, setSchedule] = useState<ApiScheduleItem[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<number | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [method, setMethod] = useState<PayMethod>(null);
  const [msisdn, setMsisdn] = useState('');
  const [groupMembers, setGroupMembers] = useState<ClientRow[]>([]);
  const [splitAmountsByMember, setSplitAmountsByMember] = useState<Record<string, number | null>>(
    {}
  );
  const [loadingMembers, setLoadingMembers] = useState(false);
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
    setHasSchedule(false);
    setSelectedInstallment(null);
    setAmountMinor(null);
    setMethod(null);
    setMsisdn('');
    setGroupMembers([]);
    setSplitAmountsByMember({});
    setLoadingMembers(false);
    setSubmitting(false);
    setError(null);
    setPhase('form');
    setReference(null);
  }, [clearPoll]);

  const loadGroupMembers = useCallback(async (selected: Loan) => {
    if (!selected.client_id) {
      setGroupMembers([]);
      return;
    }
    setLoadingMembers(true);
    try {
      const borrower = await getClient(String(selected.client_id));
      const isGroup =
        borrower != null &&
        isGroupParentClient({
          client_type: borrower.client_type,
          parent_client_id: borrower.parent_client_id ?? null,
        });
      if (!isGroup) {
        setGroupMembers([]);
        return;
      }
      const members = await getGroupMembers(Number(borrower.id));
      setGroupMembers(members);
    } catch {
      setGroupMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || !loan) {
      reset();
      return;
    }
    let cancelled = false;
    (async () => {
      setScheduleLoading(true);
      setError(null);
      try {
        const items = await getLoanSchedule(loan.id);
        if (cancelled) return;
        const open = (items ?? []).filter(isInstallmentOpen);
        setSchedule(items ?? []);
        setHasSchedule(open.length > 0);
        if (open.length === 1) {
          const only = open[0];
          setSelectedInstallment(only.installment_number);
          setAmountMinor(installmentRemaining(only));
        }
      } catch {
        if (!cancelled) {
          setSchedule([]);
          setHasSchedule(false);
        }
      } finally {
        if (!cancelled) setScheduleLoading(false);
      }
      if (!cancelled) await loadGroupMembers(loan);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, loan, reset, loadGroupMembers]);

  const applyEqualSplit = (totalMinor: number, members: ClientRow[]) => {
    if (!members.length || totalMinor <= 0) return;
    const base = Math.floor(totalMinor / members.length);
    let remainder = totalMinor - base * members.length;
    const next: Record<string, number | null> = {};
    for (const m of members) {
      const part = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      next[m.id] = part;
    }
    setSplitAmountsByMember(next);
  };

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
              ? await apiStaffAirtelCollectionStatus(auth.token, ref)
              : await apiStaffTnmCollectionStatus(auth.token, ref);
          const st = (s.status || '').toUpperCase();
          if (st === 'SUCCESS') {
            clearPoll();
            setPhase('success');
            onRecorded?.();
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
    [clearPoll, onRecorded]
  );

  const submitCustom = async () => {
    if (!loan) return;
    if (amountMinor == null || amountMinor <= 0) {
      setError('Enter a valid amount');
      return;
    }
    const amountCents = amountMinor;
    let memberContributions: Array<{ member_client_id: number; amount: number }> | undefined;
    if (groupMembers.length > 0) {
      memberContributions = groupMembers
        .map((m) => ({
          member_client_id: Number(m.id),
          amount: splitAmountsByMember[m.id] ?? 0,
        }))
        .filter((x) => x.amount > 0);
      const splitTotal = memberContributions.reduce((sum, x) => sum + x.amount, 0);
      if (!memberContributions.length) {
        setError('Enter at least one member contribution amount');
        return;
      }
      if (splitTotal !== amountCents) {
        setError('Member contribution total must match repayment amount exactly');
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const recorded = await recordRepayment(
        loan.loan_account_number,
        amountCents,
        loan.id,
        loan.client_id,
        memberContributions
      );
      if (recorded) {
        const savedOffline = recorded.sync_status === 'pending';
        Alert.alert(
          savedOffline ? 'Saved on device' : 'Payment recorded (pending ops)',
          savedOffline
            ? `${formatMinorMWK(amountCents)} saved on this device for ${loan.loan_account_number}. It will sync when you are back online.`
            : `${formatMinorMWK(amountCents)} recorded for ${loan.loan_account_number}. Status: pending ops confirmation on web BMS.`
        );
        reset();
        onClose();
        onRecorded?.();
      } else {
        const storeError = useRepaymentsStore.getState().lastError;
        setError(storeError || 'Failed to record payment');
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const submitMobileMoney = async (provider: 'airtel' | 'mpamba') => {
    if (!loan) return;
    if (provider === 'airtel' && !canAirtelCollect) {
      setError('Airtel collect is Ops-only for your role (missing airtel:collect).');
      return;
    }
    if (provider === 'mpamba' && !canTnmCollect) {
      setError('TNM collect is Ops-only for your role (missing tnm:collect).');
      return;
    }
    if (amountMinor == null || amountMinor <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (!msisdn.trim()) {
      setError(
        provider === 'airtel'
          ? 'Enter the Airtel number to collect from.'
          : 'Enter the TNM Mpamba number to collect from.'
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
      const payload = {
        loan_id: loan.id,
        amount_minor: amountMinor,
        msisdn: msisdn.trim(),
        narration: `Staff collection ${loan.loan_account_number}`,
      };
      const res =
        provider === 'airtel'
          ? await apiStaffAirtelCollectionInitiate(auth.token, payload)
          : await apiStaffTnmCollectionInitiate(auth.token, payload);
      setReference(res.reference);
      setPhase('pending');
      startPolling(res.reference, provider);
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? e.message
          : 'Failed to initiate collection. Check permissions and try again.';
      setError(msg);
      setPhase('failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrimarySubmit = () => {
    if (method === 'custom') void submitCustom();
    else if (method === 'airtel') void submitMobileMoney('airtel');
    else if (method === 'mpamba') void submitMobileMoney('mpamba');
    else setError('Select a payment method');
  };

  if (!loan) return null;

  const openInstallments = schedule.filter(isInstallmentOpen);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText type="subtitle" style={styles.title}>
                Record repayment
              </ThemedText>
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                {loan.loan_account_number}
                {loan.client_name ? ` · ${loan.client_name}` : ''}
              </ThemedText>
              <ThemedText style={styles.outstanding}>
                Outstanding {formatMinorMWK(loan.outstanding_principal)}
              </ThemedText>
            </View>
            <TouchableOpacity onPress={handleClose} disabled={submitting && phase === 'form'} hitSlop={12}>
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {phase === 'form' && (
              <>
                {scheduleLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#0a3d7a" />
                    <ThemedText style={styles.loadingText}>Loading schedule…</ThemedText>
                  </View>
                ) : hasSchedule ? (
                  <View>
                    <ThemedText style={styles.label}>Repayment schedule</ThemedText>
                    <ThemedText style={styles.hint}>Tap an installment to set the amount.</ThemedText>
                    <View style={styles.scheduleList}>
                      {openInstallments.map((item) => {
                        const remaining = installmentRemaining(item);
                        const selected = selectedInstallment === item.installment_number;
                        return (
                          <TouchableOpacity
                            key={`${item.installment_number}-${item.due_date}`}
                            style={[styles.scheduleRow, selected && styles.scheduleRowSelected]}
                            onPress={() => {
                              setSelectedInstallment(item.installment_number);
                              setAmountMinor(remaining);
                              if (groupMembers.length > 0) applyEqualSplit(remaining, groupMembers);
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
                    <View style={styles.amountWrap}>
                      <MwkMoneyInput
                        label="Amount"
                        valueMinor={amountMinor}
                        onChangeMinor={(minor) => {
                          setAmountMinor(minor);
                          if (groupMembers.length > 0 && minor != null && minor > 0) {
                            applyEqualSplit(minor, groupMembers);
                          }
                          setError(null);
                        }}
                        placeholder="MWK 0"
                        disabled={submitting}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.amountWrap}>
                    <ThemedText style={styles.hint}>
                      No repayment schedule on this loan. Enter the amount to collect.
                    </ThemedText>
                    <MwkMoneyInput
                      label="Amount"
                      valueMinor={amountMinor}
                      onChangeMinor={(minor) => {
                        setAmountMinor(minor);
                        if (groupMembers.length > 0 && minor != null && minor > 0) {
                          applyEqualSplit(minor, groupMembers);
                        }
                        setError(null);
                      }}
                      placeholder="MWK 0"
                      disabled={submitting}
                    />
                  </View>
                )}

                <ThemedText style={[styles.label, { marginTop: 18 }]}>Payment method</ThemedText>
                <View style={styles.methodRow}>
                  {canAirtelCollect ? (
                    <MethodCard
                      icon="smartphone"
                      label="Airtel Money"
                      selected={method === 'airtel'}
                      onPress={() => {
                        setMethod('airtel');
                        setError(null);
                        setPhase('form');
                      }}
                    />
                  ) : null}
                  {canTnmCollect ? (
                    <MethodCard
                      icon="phone-android"
                      label="TNM Mpamba"
                      selected={method === 'mpamba'}
                      onPress={() => {
                        setMethod('mpamba');
                        setError(null);
                        setPhase('form');
                      }}
                    />
                  ) : null}
                  <MethodCard
                    icon="payments"
                    label="Custom"
                    selected={method === 'custom'}
                    onPress={() => {
                      setMethod('custom');
                      setError(null);
                      setPhase('form');
                      if (amountMinor != null && amountMinor > 0 && groupMembers.length > 0) {
                        applyEqualSplit(amountMinor, groupMembers);
                      }
                    }}
                  />
                </View>
                {!canAirtelCollect && !canTnmCollect ? (
                  <ThemedText style={styles.hint}>
                    Mobile-money collect requires Ops permissions (airtel:collect / tnm:collect).
                    Use Custom to record a pending payment.
                  </ThemedText>
                ) : null}

                {(method === 'airtel' || method === 'mpamba') && (
                  <View style={styles.mmisdnWrap}>
                    <ThemedText style={styles.label}>
                      {method === 'airtel' ? 'Airtel number' : 'TNM Mpamba number'}
                    </ThemedText>
                    <TextInput
                      style={styles.input}
                      keyboardType="phone-pad"
                      placeholder="e.g. +265991234567"
                      placeholderTextColor="#9ca3af"
                      value={msisdn}
                      onChangeText={setMsisdn}
                      editable={!submitting}
                    />
                    <ThemedText style={styles.hint}>
                      Client will receive a payment prompt on this number.
                    </ThemedText>
                  </View>
                )}

                {method === 'custom' && loadingMembers ? (
                  <ThemedText style={styles.hint}>Loading group members…</ThemedText>
                ) : null}

                {method === 'custom' && groupMembers.length > 0 ? (
                  <View style={styles.groupSplitWrap}>
                    <View style={styles.groupSplitHead}>
                      <ThemedText style={styles.label}>Member contributions</ThemedText>
                      <TouchableOpacity
                        onPress={() => {
                          if (amountMinor != null && amountMinor > 0) {
                            applyEqualSplit(amountMinor, groupMembers);
                          }
                        }}
                      >
                        <ThemedText style={styles.equalBtn}>Auto-split</ThemedText>
                      </TouchableOpacity>
                    </View>
                    {groupMembers.map((m) => (
                      <View key={m.id} style={styles.memberRow}>
                        <ThemedText style={styles.memberName}>{m.name}</ThemedText>
                        <View style={styles.memberInputWrap}>
                          <MwkMoneyInput
                            valueMinor={splitAmountsByMember[m.id] ?? null}
                            onChangeMinor={(minor) => {
                              setSplitAmountsByMember((prev) => ({ ...prev, [m.id]: minor }));
                              setError(null);
                            }}
                            placeholder="MWK 0"
                            hint={false}
                            disabled={submitting}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    (!method || !amountMinor || submitting) && styles.submitBtnDisabled,
                  ]}
                  onPress={handlePrimarySubmit}
                  disabled={!method || !amountMinor || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="payment" size={20} color="#fff" />
                      <ThemedText style={styles.submitText}>
                        {method === 'custom'
                          ? 'Record payment'
                          : method === 'airtel'
                            ? 'Request Airtel payment'
                            : method === 'mpamba'
                              ? 'Request Mpamba payment'
                              : 'Continue'}
                      </ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {phase === 'pending' && reference ? (
              <View>
                <View style={[styles.alertBox, styles.alertPending]}>
                  <ActivityIndicator size="small" color="#b45309" />
                  <ThemedText style={[styles.alertText, { color: '#92400e' }]}>
                    Waiting for the client to approve the payment prompt.
                  </ThemedText>
                </View>
                <ThemedText style={styles.label}>Payment reference</ThemedText>
                <ThemedText selectable style={styles.reference}>
                  {reference}
                </ThemedText>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleClose}>
                  <ThemedText style={styles.secondaryBtnText}>Close</ThemedText>
                </TouchableOpacity>
              </View>
            ) : null}

            {phase === 'success' ? (
              <View>
                <View style={[styles.alertBox, styles.alertSuccess]}>
                  <MaterialIcons name="check-circle" size={22} color="#047857" />
                  <ThemedText style={[styles.alertText, { color: '#065f46' }]}>
                    Payment received. Posting to the loan will continue on the server.
                  </ThemedText>
                </View>
                <TouchableOpacity style={styles.submitBtn} onPress={handleClose}>
                  <ThemedText style={styles.submitText}>Done</ThemedText>
                </TouchableOpacity>
              </View>
            ) : null}

            {phase === 'failed' ? (
              <View>
                <View style={[styles.alertBox, styles.alertFailed]}>
                  <MaterialIcons name="error-outline" size={22} color="#b91c1c" />
                  <ThemedText style={[styles.alertText, { color: '#991b1b' }]}>
                    {error || 'Payment failed.'}
                  </ThemedText>
                </View>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={() => {
                    setPhase('form');
                    setError(null);
                    setReference(null);
                  }}
                >
                  <ThemedText style={styles.submitText}>Try again</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleClose}>
                  <ThemedText style={styles.secondaryBtnText}>Close</ThemedText>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
      <MaterialIcons name={icon} size={22} color={selected ? '#0a3d7a' : '#6b7280'} />
      <ThemedText style={[styles.methodLabel, selected && styles.methodLabelSelected]}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#f8f9fb',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 18 },
  subtitle: { fontSize: 13, opacity: 0.8, marginTop: 4 },
  outstanding: { fontSize: 12, color: '#0a3d7a', fontWeight: '600', marginTop: 4 },
  body: { maxHeight: 560 },
  bodyContent: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  hint: { fontSize: 12, opacity: 0.65, marginBottom: 10 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { opacity: 0.7 },
  scheduleList: { gap: 8, marginBottom: 8 },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  scheduleRowSelected: {
    borderColor: '#0a3d7a',
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  scheduleNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleNumText: { fontSize: 12, fontWeight: '700', color: '#0a3d7a' },
  scheduleMid: { flex: 1, minWidth: 0 },
  scheduleDate: { fontSize: 13, fontWeight: '600' },
  scheduleAmount: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  scheduleStatus: { fontSize: 11, opacity: 0.65, textTransform: 'capitalize' },
  amountWrap: { marginTop: 8 },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodCard: {
    flex: 1,
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
    borderColor: '#0a3d7a',
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  methodLabel: { fontSize: 11, textAlign: 'center', color: '#4b5563', fontWeight: '600' },
  methodLabelSelected: { color: '#0a3d7a' },
  mmisdnWrap: { marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  groupSplitWrap: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: '#fff',
  },
  groupSplitHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  equalBtn: { color: '#0a3d7a', fontWeight: '600' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  memberName: { flex: 1, fontSize: 13 },
  memberInputWrap: { width: 160 },
  error: { color: '#ef4444', marginTop: 10 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0a3d7a',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 10,
    backgroundColor: '#fff',
  },
  secondaryBtnText: { fontWeight: '600', color: '#374151' },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  alertPending: { backgroundColor: '#fffbeb' },
  alertSuccess: { backgroundColor: '#ecfdf5' },
  alertFailed: { backgroundColor: '#fef2f2' },
  alertText: { flex: 1, fontSize: 14, lineHeight: 20 },
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
