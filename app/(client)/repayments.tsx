import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  ClientEmptyState,
  ClientHeader,
  ClientListCard,
  ClientSectionTitle,
  clientListStyles,
} from '@/components/client-ui';
import { ClientPaymentHistoryDetailModal } from '@/components/client-payment-history-detail-modal';
import { ClientRepaymentModal } from '@/components/client-repayment-modal';
import { PendingPaymentsCard } from '@/components/pending-payments-card';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { CoFiColors } from '@/constants/theme';
import { useRepaymentsStore } from '@/store/repayments';
import { useLoansStore } from '@/store/loans';
import { useClientNotificationsStore } from '@/store/client-notifications';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { useClientHeaderTrailing } from '@/hooks/use-client-header-trailing';
import {
  clientMayRecordRepayment,
  loanOutstandingForViewer,
} from '@/lib/loan-origination/group-share-display';
import { repaymentLifecycleLabel } from '@/lib/client-portal/repayment-draft';
import { useClientSessionStore } from '@/store/client-session';
import type { Loan } from '@/store';
import type { Repayment } from '@/store/test-data';
import type { MobileClientSessionContext } from '@/lib/data/api';

const REPAYABLE_STATUSES = new Set([
  'ACTIVE',
  'DISBURSED',
  'OVERDUE',
  'ARREARS',
  'CURRENT',
  'PAR',
]);

function repaymentSortKey(dateStr: string) {
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function isRepayableLoan(
  loan: Loan,
  session: MobileClientSessionContext | null | undefined
): boolean {
  if (!clientMayRecordRepayment(session, loan)) return false;
  const outstanding = loanOutstandingForViewer(loan);
  if (outstanding <= 0) return false;
  const status = (loan.status ?? '').toUpperCase();
  if (status === 'CLOSED' || status === 'WRITTEN_OFF' || status === 'WRITE_OFF') return false;
  // Prefer known repayable statuses; still allow unknown non-closed with balance.
  if (!status) return true;
  return REPAYABLE_STATUSES.has(status) || !['REJECTED', 'PENDING', 'CANCELLED'].includes(status);
}

export default function ClientRepaymentsScreen() {
  const router = useRouter();
  const {
    repayments,
    loading: repaymentsLoading,
    lastError,
    fetchRepayments,
    clearError,
  } = useRepaymentsStore();
  const { loans, loading: loansLoading, fetchLoans } = useLoansStore();
  const session = useClientSessionStore((s) => s.session);
  const unreadCount = useClientNotificationsStore((s) => s.unreadCount);
  const headerTrailing = useClientHeaderTrailing();
  const [refreshing, setRefreshing] = useState(false);
  const [repayLoan, setRepayLoan] = useState<Loan | null>(null);
  const [repayOpen, setRepayOpen] = useState(false);
  const [pickingLoan, setPickingLoan] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Repayment | null>(null);

  const openRepay = useCallback((loan: Loan) => {
    setPickingLoan(false);
    setRepayLoan(loan);
    setRepayOpen(true);
  }, []);

  const startPaymentFlow = useCallback(() => {
    const repayable = loans.filter((l) => isRepayableLoan(l, session));
    if (repayable.length === 1) {
      openRepay(repayable[0]);
      return;
    }
    if (repayable.length > 1) {
      setPickingLoan(true);
      return;
    }
    // No repayable loans in store — send borrower to My Loans for context.
    router.push('/(client)/loans');
  }, [loans, openRepay, router, session]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchRepayments(), fetchLoans()]);
    setRefreshing(false);
  }, [fetchRepayments, fetchLoans]);

  useEffect(() => {
    void fetchRepayments();
    void fetchLoans();
  }, [fetchRepayments, fetchLoans]);

  const sortedRepayments = useMemo(
    () =>
      [...repayments].sort(
        (a, b) => repaymentSortKey(b.repayment_date) - repaymentSortKey(a.repayment_date)
      ),
    [repayments]
  );

  const repayableLoans = useMemo(
    () =>
      loans
        .filter((l) => isRepayableLoan(l, session))
        .sort(
          (a, b) => (a.days_until_next_repayment ?? 999) - (b.days_until_next_repayment ?? 999)
        ),
    [loans, session]
  );

  const viewableLoans = useMemo(
    () => loans.filter((l) => loanOutstandingForViewer(l) > 0),
    [loans]
  );

  const nextLoan = repayableLoans[0] ?? viewableLoans[0] ?? null;
  const totalPaid = repayments.reduce((s, r) => s + r.amount, 0);
  const initialLoading = (repaymentsLoading || loansLoading) && !refreshing && repayments.length === 0 && loans.length === 0;
  const canPay = repayableLoans.length > 0;
  const memberViewOnly =
    session?.dashboard_mode === 'group_member' &&
    session.can_record_group_repayments !== true &&
    viewableLoans.length > 0;

  return (
    <View style={styles.root}>
      <ClientHeader
        title="Payments"
        subtitle="Upcoming dues, mobile money & history"
        showNotifications={headerTrailing.showNotifications}
        showProfile={headerTrailing.showProfile}
        unreadCount={unreadCount}
        stats={[
          { label: 'Payments', value: String(repayments.length) },
          { label: 'Total paid', value: formatMinorMWK(totalPaid) },
        ]}
      />

      {lastError ? (
        <Pressable style={styles.errorBanner} onPress={() => clearError()}>
          <MaterialIcons name="error-outline" size={16} color="#fff" />
          <ThemedText style={styles.errorBannerText}>{lastError}</ThemedText>
        </Pressable>
      ) : null}

      {initialLoading ? (
        <ActivityIndicator size="large" color={CoFiColors.primary} style={styles.loader} />
      ) : (
        <>
          <FlatList
            style={styles.listViewport}
            data={sortedRepayments}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={CoFiColors.primary}
              />
            }
            ListHeaderComponent={
              <View style={styles.headerBlock}>
                <View style={styles.dueCard}>
                  <View style={styles.dueTop}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.dueOverline}>
                        {canPay ? 'Next payment' : 'Make a payment'}
                      </ThemedText>
                      {nextLoan ? (
                        <>
                          <ThemedText style={styles.dueAmount}>
                            {formatMinorMWK(loanOutstandingForViewer(nextLoan))}
                          </ThemedText>
                          <ThemedText style={styles.dueMeta}>
                            {nextLoan.loan_account_number}
                            {nextLoan.is_group_facility ? ' · Your share' : ''} · Due{' '}
                            {nextLoan.next_due_date || '—'}
                          </ThemedText>
                        </>
                      ) : (
                        <>
                          <ThemedText style={styles.dueAmountEmpty}>No active loan due</ThemedText>
                          <ThemedText style={styles.dueMeta}>
                            Pull to refresh, or open My Loans if you recently disbursed.
                          </ThemedText>
                        </>
                      )}
                    </View>
                    <MaterialIcons name="event" size={28} color={ClientUI.colors.accent} />
                  </View>

                  {memberViewOnly ? (
                    <ThemedText style={styles.memberHint}>
                      Only an authorized group leader can record repayments. You can still view your
                      share outstanding and payment history below.
                    </ThemedText>
                  ) : null}

                  <Pressable
                    style={[styles.payBtn, !canPay && styles.payBtnMuted]}
                    onPress={startPaymentFlow}
                    accessibilityRole="button"
                    accessibilityLabel="Make a payment"
                  >
                    <MaterialIcons
                      name="payment"
                      size={18}
                      color={canPay ? ClientUI.colors.primaryDeep : '#fff'}
                    />
                    <ThemedText style={[styles.payBtnText, !canPay && styles.payBtnTextMuted]}>
                      {canPay
                        ? repayableLoans.length > 1
                          ? 'Choose loan & pay'
                          : 'Make a payment'
                        : 'View my loans'}
                    </ThemedText>
                  </Pressable>
                </View>

                <PendingPaymentsCard />

                {pickingLoan && repayableLoans.length > 1 ? (
                  <View style={styles.pickerCard}>
                    <View style={styles.pickerHeader}>
                      <ThemedText style={styles.pickerTitle}>Select a loan to repay</ThemedText>
                      <Pressable onPress={() => setPickingLoan(false)} hitSlop={8}>
                        <MaterialIcons name="close" size={20} color={ClientUI.colors.textMuted} />
                      </Pressable>
                    </View>
                    {repayableLoans.map((l) => (
                      <Pressable
                        key={l.id}
                        style={styles.pickerRow}
                        onPress={() => openRepay(l)}
                      >
                        <View style={{ flex: 1 }}>
                          <ThemedText style={clientListStyles.title} numberOfLines={1}>
                            {l.loan_account_number}
                          </ThemedText>
                          <ThemedText style={styles.upcomingSub}>
                            {l.product_name} · Due {l.next_due_date || '—'}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.upcomingAmt}>
                          {formatMinorMWK(loanOutstandingForViewer(l))}
                        </ThemedText>
                        <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.primary} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {repayableLoans.length > 1 && !pickingLoan ? (
                  <>
                    <ClientSectionTitle title="All upcoming" />
                    {repayableLoans.slice(0, 6).map((l) => (
                      <Pressable key={l.id} style={styles.upcomingRow} onPress={() => openRepay(l)}>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={clientListStyles.title} numberOfLines={1}>
                            {l.loan_account_number}
                          </ThemedText>
                          <ThemedText style={styles.upcomingSub}>
                            Due {l.next_due_date || '—'}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.upcomingAmt}>
                          {formatMinorMWK(loanOutstandingForViewer(l))}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </>
                ) : null}

                <ClientSectionTitle title="Payment history" />
              </View>
            }
            ListEmptyComponent={
              repayments.length === 0 && repayableLoans.length === 0 ? (
                <ClientEmptyState
                  icon="payment"
                  title="No payment activity yet"
                  message="When you have an active loan, use Make a payment above to pay via Airtel Money, TNM Mpamba, or custom transfer."
                />
              ) : (
                <ThemedText style={styles.emptyHint}>No posted repayments yet.</ThemedText>
              )
            }
            renderItem={({ item }) => (
              <ClientListCard onPress={() => setSelectedPayment(item)} showChevron>
                <View style={clientListStyles.row}>
                  <ThemedText style={clientListStyles.title}>{item.loan_account_number}</ThemedText>
                  <ThemedText style={clientListStyles.amountPositive}>
                    {formatMinorMWK(item.amount)}
                  </ThemedText>
                </View>
                <View style={clientListStyles.divider} />
                <View style={clientListStyles.row}>
                  <ThemedText style={clientListStyles.label}>Date</ThemedText>
                  <ThemedText style={clientListStyles.value}>{item.repayment_date}</ThemedText>
                </View>
                <View style={clientListStyles.row}>
                  <ThemedText style={clientListStyles.label}>Principal / Interest</ThemedText>
                  <ThemedText style={clientListStyles.value}>
                    {item.principal_amount > 0 || item.interest_amount > 0
                      ? `${formatMinorMWK(item.principal_amount)} / ${formatMinorMWK(item.interest_amount)}`
                      : 'Pending allocation'}
                  </ThemedText>
                </View>
                <View style={clientListStyles.row}>
                  <ThemedText style={clientListStyles.label}>Status</ThemedText>
                  <ThemedText style={clientListStyles.value}>
                    {repaymentLifecycleLabel(item)}
                  </ThemedText>
                </View>
                <ThemedText style={styles.tapHint}>Tap for details & lifecycle</ThemedText>
              </ClientListCard>
            )}
          />

          {/* Sticky bottom CTA — always reachable without scrolling to header */}
          <View style={styles.stickyBar}>
            <Pressable
              style={[styles.stickyBtn, !canPay && styles.stickyBtnMuted]}
              onPress={startPaymentFlow}
              accessibilityRole="button"
              accessibilityLabel="Make a payment"
            >
              <MaterialIcons name="payment" size={20} color="#fff" />
              <ThemedText style={styles.stickyBtnText}>
                {canPay
                  ? repayableLoans.length > 1
                    ? 'Pay a loan'
                    : 'Make a payment'
                  : 'View my loans'}
              </ThemedText>
            </Pressable>
          </View>
        </>
      )}

      <ClientRepaymentModal
        loan={repayLoan}
        visible={repayOpen}
        onClose={() => {
          setRepayOpen(false);
          setRepayLoan(null);
        }}
        onSuccess={() => {
          void fetchRepayments();
          void fetchLoans();
        }}
      />

      <ClientPaymentHistoryDetailModal
        visible={selectedPayment != null}
        payment={selectedPayment}
        onClose={() => setSelectedPayment(null)}
        onChanged={() => {
          void fetchRepayments();
          void fetchLoans();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ClientUI.colors.canvas },
  listViewport: { flex: 1 },
  loader: { marginTop: 48 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#b91c1c',
  },
  errorBannerText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  list: { padding: 20, paddingTop: 8, paddingBottom: 100 },
  headerBlock: { marginBottom: 8 },
  dueCard: {
    backgroundColor: ClientUI.colors.primaryDeep,
    borderRadius: ClientUI.radius.hero,
    padding: 20,
    marginBottom: 16,
    ...ClientUI.shadows.hero,
  },
  dueTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  dueOverline: {
    ...ClientUI.typography.overline,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
  },
  dueAmount: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  dueAmountEmpty: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  dueMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
    lineHeight: 18,
  },
  memberHint: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 12,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  payBtnMuted: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  payBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: ClientUI.colors.primaryDeep,
  },
  payBtnTextMuted: {
    color: '#fff',
  },
  pickerCard: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    padding: 12,
    marginBottom: 16,
    gap: 4,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ClientUI.colors.text,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: ClientUI.colors.surfaceMuted,
    marginBottom: 6,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  upcomingSub: { fontSize: 12, color: ClientUI.colors.textMuted, marginTop: 2 },
  upcomingAmt: { fontSize: 15, fontWeight: '700', color: ClientUI.colors.primary },
  emptyHint: {
    fontSize: 14,
    color: ClientUI.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 16,
  },
  tapHint: {
    marginTop: 8,
    fontSize: 12,
    color: ClientUI.colors.primary,
    fontWeight: '600',
  },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: ClientUI.colors.canvas,
    borderTopWidth: 1,
    borderTopColor: ClientUI.colors.border,
  },
  stickyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    ...ClientUI.shadows.action,
  },
  stickyBtnMuted: {
    backgroundColor: ClientUI.colors.primaryDeep,
    opacity: 0.85,
  },
  stickyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
