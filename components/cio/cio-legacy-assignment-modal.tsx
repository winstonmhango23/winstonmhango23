import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiAssignLegacyLoanOfficer,
  apiGetLegacyAssignedLoans,
  apiGetLegacyUnassignedLoans,
  apiGetLoanAssignmentOfficers,
  apiUnassignLegacyLoanOfficer,
  type ApiLegacyAssignmentPage,
  type ApiLoanAssignmentOfficer,
  type ApiLoanAssignmentSummary,
} from '@/lib/data/api';
import { labelOpsEnum } from '@/lib/ops-records';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';

type Tab = 'pool' | 'officers';

export function CioLegacyAssignmentModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('pool');
  const [officers, setOfficers] = useState<ApiLoanAssignmentOfficer[]>([]);
  const [selectedOfficerId, setSelectedOfficerId] = useState<number | null>(null);
  const [pool, setPool] = useState<ApiLoanAssignmentSummary[]>([]);
  const [poolTotal, setPoolTotal] = useState(0);
  const [poolSearch, setPoolSearch] = useState('');
  const [assigned, setAssigned] = useState<ApiLoanAssignmentSummary[]>([]);
  const [assignedTotal, setAssignedTotal] = useState(0);
  const [assigningLoanId, setAssigningLoanId] = useState<number | null>(null);
  const [pendingOfficerId, setPendingOfficerId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOfficers = useCallback(async (token: string) => {
    try {
      setOfficers(await apiGetLoanAssignmentOfficers(token));
    } catch {
      setOfficers([]);
    }
  }, []);

  const loadPool = useCallback(async (token: string, search?: string) => {
    try {
      const page: ApiLegacyAssignmentPage = await apiGetLegacyUnassignedLoans(token, {
        search: search?.trim() || undefined,
        limit: 100,
      });
      setPool(page.items ?? []);
      setPoolTotal(page.total ?? 0);
    } catch (e) {
      setPool([]);
      setPoolTotal(0);
      setError(e instanceof Error ? e.message : 'Could not load the unassigned pool.');
    }
  }, []);

  const loadAssigned = useCallback(async (token: string, officerId: number) => {
    try {
      const page: ApiLegacyAssignmentPage = await apiGetLegacyAssignedLoans(token, officerId, {
        limit: 100,
      });
      setAssigned(page.items ?? []);
      setAssignedTotal(page.total ?? 0);
    } catch (e) {
      setAssigned([]);
      setAssignedTotal(0);
      setError(e instanceof Error ? e.message : 'Could not load the officer assignments.');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPoolSearch('');
    setSelectedOfficerId(null);
    setAssigned([]);
    setAssignedTotal(0);
    setAssigningLoanId(null);
    setPendingOfficerId(null);
    setReason('');
    setLoading(true);
    void (async () => {
      try {
        const auth = await getStoredAuth();
        if (!auth?.token) return;
        await Promise.all([loadOfficers(auth.token), loadPool(auth.token)]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load legacy assignments.');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, loadOfficers, loadPool]);

  useEffect(() => {
    if (!open || tab !== 'officers' || selectedOfficerId == null) return;
    void (async () => {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await loadAssigned(auth.token, selectedOfficerId);
    })();
  }, [open, tab, selectedOfficerId, loadAssigned]);

  const assignLoan = async (loanId: number) => {
    if (pendingOfficerId == null) {
      setError('Select a loan officer before assigning.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await apiAssignLegacyLoanOfficer(auth.token, loanId, pendingOfficerId, reason);
      await Promise.all([
        loadOfficers(auth.token),
        loadPool(auth.token, tab === 'pool' ? poolSearch : undefined),
      ]);
      setAssigningLoanId(null);
      setPendingOfficerId(null);
      setReason('');
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assignment failed.');
    } finally {
      setBusy(false);
    }
  };

  const unassignLoan = async (loanId: number) => {
    Alert.alert('Release legacy loan?', 'The loan returns to the unassigned follow-up pool.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Release',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const auth = await getStoredAuth();
              if (!auth?.token) return;
              await apiUnassignLegacyLoanOfficer(auth.token, loanId);
              if (selectedOfficerId != null) await loadAssigned(auth.token, selectedOfficerId);
              await Promise.all([loadOfficers(auth.token), loadPool(auth.token)]);
              onChanged?.();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Release failed.');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const officerName = (id: number | null | undefined): string =>
    officers.find((o) => o.id === id)?.full_name ?? `Officer #${id ?? '?'}`;

  const assignedBalance = (loan: ApiLoanAssignmentSummary) =>
    formatMinorMWK(
      (loan.outstanding_principal ?? 0) + (loan.outstanding_interest ?? 0)
    );

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            Legacy follow-up assignment
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Assign legacy loans to loan officers for follow-up. Loan officers track assigned
            legacy loans on their own book.
          </ThemedText>

          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, tab === 'pool' && styles.tabActive]}
              onPress={() => setTab('pool')}
              disabled={busy}
            >
              <ThemedText style={[styles.tabText, tab === 'pool' && styles.tabTextActive]}>
                Pool ({poolTotal})
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.tab, tab === 'officers' && styles.tabActive]}
              onPress={() => setTab('officers')}
              disabled={busy}
            >
              <ThemedText style={[styles.tabText, tab === 'officers' && styles.tabTextActive]}>
                Officers ({officers.length})
              </ThemedText>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={CoFiColors.primary} style={styles.spinner} />
          ) : tab === 'pool' ? (
            <>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.input}
                  value={poolSearch}
                  onChangeText={setPoolSearch}
                  placeholder="Search client or account"
                  placeholderTextColor={CoFiColors.mutedForeground}
                  onSubmitEditing={() => {
                    void (async () => {
                      const auth = await getStoredAuth();
                      if (auth?.token) await loadPool(auth.token, poolSearch);
                    })();
                  }}
                />
                <Pressable
                  style={styles.searchBtn}
                  onPress={() => {
                    void (async () => {
                      const auth = await getStoredAuth();
                      if (auth?.token) await loadPool(auth.token, poolSearch);
                    })();
                  }}
                  disabled={busy}
                >
                  <ThemedText style={styles.primaryText}>Search</ThemedText>
                </Pressable>
              </View>
              <ScrollView style={styles.list}>
                {pool.length === 0 ? (
                  <ThemedText style={styles.meta}>
                    No unassigned legacy loans{poolSearch ? ' matching your search' : ''}.
                  </ThemedText>
                ) : (
                  pool.map((loan) => {
                    const id = Number(loan.id);
                    const expanding = assigningLoanId === id;
                    return (
                      <View key={loan.id ?? String(id)} style={styles.record}>
                        <View style={styles.recordHead}>
                          <View style={styles.recordMain}>
                            <ThemedText type="defaultSemiBold">
                              {loan.client_name || 'Unknown client'}
                            </ThemedText>
                            <ThemedText style={styles.meta}>
                              {[loan.loan_account_number, labelOpsEnum(loan.status || '')]
                                .filter(Boolean)
                                .join(' · ')}
                            </ThemedText>
                          </View>
                          <ThemedText style={styles.amount}>{assignedBalance(loan)}</ThemedText>
                        </View>
                        {!expanding ? (
                          <Pressable
                            style={styles.assignBtn}
                            disabled={busy}
                            onPress={() => {
                              setError(null);
                              setAssigningLoanId(id);
                              setPendingOfficerId(null);
                              setReason('');
                            }}
                          >
                            <ThemedText style={styles.primaryText}>Assign</ThemedText>
                          </Pressable>
                        ) : (
                          <View style={styles.assignPanel}>
                            <ThemedText style={styles.meta}>Loan officer</ThemedText>
                            {officers.length === 0 ? (
                              <ThemedText style={styles.meta}>
                                No active loan officers in this branch scope.
                              </ThemedText>
                            ) : (
                              officers.map((officer) => {
                                const active = pendingOfficerId === officer.id;
                                return (
                                  <Pressable
                                    key={officer.id}
                                    style={[styles.officer, active && styles.officerActive]}
                                    disabled={busy}
                                    onPress={() => {
                                      setPendingOfficerId(officer.id);
                                    }}
                                  >
                                    <ThemedText type="defaultSemiBold">
                                      {officer.full_name || `Officer #${officer.id}`}
                                    </ThemedText>
                                    <ThemedText style={styles.meta}>
                                      {[
                                        officer.employee_id,
                                        `${officer.assigned_legacy_count ?? 0} assigned`,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </ThemedText>
                                  </Pressable>
                                );
                              })
                            )}
                            <TextInput
                              style={[styles.input, styles.reasonInput]}
                              value={reason}
                              onChangeText={setReason}
                              placeholder="Reason (optional)"
                              placeholderTextColor={CoFiColors.mutedForeground}
                            />
                            <View style={styles.row}>
                              <Pressable
                                style={styles.secondary}
                                disabled={busy}
                                onPress={() => setAssigningLoanId(null)}
                              >
                                <ThemedText>Cancel</ThemedText>
                              </Pressable>
                              <Pressable
                                style={[styles.primary, (busy || pendingOfficerId == null) && styles.disabled]}
                                disabled={busy || pendingOfficerId == null}
                                onPress={() => void assignLoan(id)}
                              >
                                {busy ? (
                                  <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                  <ThemedText style={styles.primaryText}>Confirm</ThemedText>
                                )}
                              </Pressable>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </>
          ) : (
            <>
              <ScrollView style={styles.list}>
                {officers.length === 0 ? (
                  <ThemedText style={styles.meta}>
                    No active loan officers in this branch scope.
                  </ThemedText>
                ) : (
                  officers.map((officer) => {
                    const active = selectedOfficerId === officer.id;
                    return (
                      <Pressable
                        key={officer.id}
                        style={[styles.officer, active && styles.officerActive]}
                        disabled={busy}
                        onPress={() => {
                          setSelectedOfficerId((prev) => (prev === officer.id ? null : officer.id));
                        }}
                      >
                        <ThemedText type="defaultSemiBold">
                          {officer.full_name || `Officer #${officer.id}`}
                        </ThemedText>
                        <ThemedText style={styles.meta}>
                          {[
                            officer.employee_id,
                            `${officer.assigned_legacy_count ?? 0} legacy loans assigned`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </ThemedText>
                      </Pressable>
                    );
                  })
                )}
                {selectedOfficerId != null ? (
                  <View style={styles.assignedBlock}>
                    <ThemedText type="defaultSemiBold" style={styles.subHeader}>
                      {assignedTotal} assigned to {officerName(selectedOfficerId)}
                    </ThemedText>
                    {assigned.length === 0 ? (
                      <ThemedText style={styles.meta}>No legacy loans assigned yet.</ThemedText>
                    ) : (
                      assigned.map((loan) => {
                        const id = Number(loan.id);
                        return (
                          <View key={loan.id ?? String(id)} style={styles.record}>
                            <View style={styles.recordMain}>
                              <ThemedText type="defaultSemiBold">
                                {loan.client_name || 'Unknown client'}
                              </ThemedText>
                              <ThemedText style={styles.meta}>
                                {[
                                  loan.loan_account_number,
                                  labelOpsEnum(loan.status || ''),
                                  loan.next_due_date,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </ThemedText>
                            </View>
                            <View style={styles.row}>
                              <ThemedText style={styles.amount}>{assignedBalance(loan)}</ThemedText>
                              <Pressable
                                style={styles.releaseBtn}
                                disabled={busy}
                                onPress={() => void unassignLoan(id)}
                              >
                                <ThemedText style={styles.releaseText}>Release</ThemedText>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                ) : null}
              </ScrollView>
            </>
          )}

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          <View style={styles.row}>
            <Pressable style={[styles.secondary, styles.closeBtn]} onPress={onClose} disabled={busy}>
              <ThemedText>Close</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    maxHeight: '85%',
    gap: 10,
  },
  title: { fontSize: 18 },
  subtitle: { fontSize: 13, opacity: 0.7 },
  spinner: { marginVertical: 24 },
  tabs: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9 },
  tabActive: { backgroundColor: CoFiColors.primary },
  tabText: { fontSize: 13 },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: CoFiColors.foreground,
  },
  searchBtn: {
    backgroundColor: CoFiColors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  list: { maxHeight: 380 },
  record: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  recordHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recordMain: { flex: 1 },
  meta: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  amount: { fontSize: 13, fontWeight: '700' },
  assignBtn: {
    alignSelf: 'flex-start',
    backgroundColor: CoFiColors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  assignPanel: { gap: 8, borderTopWidth: 1, borderTopColor: CoFiColors.border, paddingTop: 8 },
  officer: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  officerActive: {
    borderColor: CoFiColors.primary,
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  reasonInput: { minHeight: 40 },
  primaryText: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  secondary: { paddingHorizontal: 12, paddingVertical: 10 },
  closeBtn: { marginRight: 'auto' },
  primary: {
    backgroundColor: CoFiColors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 90,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  error: { color: '#b91c1c', fontSize: 13 },
  assignedBlock: { marginTop: 12, gap: 8 },
  subHeader: { marginTop: 4 },
  releaseBtn: {
    borderWidth: 1,
    borderColor: '#b91c1c',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  releaseText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
});