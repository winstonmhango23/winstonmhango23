import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { StaffLoanPickerModal } from '@/components/staff-loan-picker-modal';
import { StaffRepaymentModal } from '@/components/staff-repayment-modal';
import { RepaymentReversalModal } from '@/components/repayment-reversal-modal';
import { RepaymentKpiStrip } from '@/components/staff/repayments/repayment-kpi-strip';
import { ClientEmptyState, ClientFab } from '@/components/staff-ui';
import { AmountText } from '@/components/ui/amount-text';
import { ListCard, StatusBadge, SyncStatusBadge, listCardStyles } from '@/components/ui/list-card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { opsRepaymentRecordHref, opsRepaymentRoleFromBackend } from '@/lib/ops-records';
import { canCollectRepayments } from '@/lib/repayment-role-workspace';
import {
  dedicatedStaffRepaymentFlow,
  liveTrackingCount,
  overviewToKpis,
  staffRepaymentHubCopy,
} from '@/lib/staff/repayment-flows';
import { useRepaymentsStore } from '@/store/repayments';
import { useLoansStore } from '@/store/loans';
import { useAuthStore } from '@/store/auth';
import type { Loan } from '@/store';
import type { ApiRepaymentOverviewItem } from '@/lib/data/api';
import { overviewToStaffLoan } from '@/lib/staff/legacy-repayment-book';

type HubTab = 'due' | 'overdue' | 'upcoming' | 'awaiting' | 'recorded';

function normalizeTab(raw: string | string[] | undefined): HubTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  switch ((value || '').toLowerCase()) {
    case 'overdue':
      return 'overdue';
    case 'upcoming':
      return 'upcoming';
    case 'awaiting':
    case 'awaiting_verification':
    case 'verification':
      return 'awaiting';
    case 'recorded':
    case 'history':
      return 'recorded';
    case 'due':
    case 'due_today':
      return 'due';
    default:
      return 'due';
  }
}

function HubLoanCard({
  item,
  onPress,
  onRecord,
}: {
  item: ApiRepaymentOverviewItem;
  onPress: () => void;
  onRecord?: () => void;
}) {
  return (
    <ListCard onPress={onPress} cardStyle={styles.cardActive}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardTitleBlock}>
          <ThemedText numberOfLines={1} ellipsizeMode="tail" type="defaultSemiBold">
            {item.loan_account_number}
          </ThemedText>
          {item.client_name ? (
            <ThemedText style={styles.clientName} numberOfLines={1} ellipsizeMode="tail">
              {item.client_name}
            </ThemedText>
          ) : null}
        </View>
        <StatusBadge status={item.status ?? 'ACTIVE'} type="loan" />
      </View>
      <View style={listCardStyles.divider} />
      <View style={styles.bottomRow}>
        <View style={styles.amountColumn}>
          <ThemedText style={listCardStyles.label}>Outstanding</ThemedText>
          <AmountText cents={item.outstanding_principal ?? 0} style={styles.amountValue} />
        </View>
        <View style={styles.amountColumn}>
          <ThemedText style={listCardStyles.label}>Next due</ThemedText>
          <AmountText cents={item.next_due_amount ?? 0} style={styles.amountValue} />
        </View>
      </View>
      <View style={styles.bottomRow}>
        <View style={styles.metaItem}>
          <MaterialIcons name="event" size={14} color={CoFiColors.mutedForeground} />
          <ThemedText style={styles.metaText}>
            {item.next_due_date
              ? String(item.next_due_date).slice(0, 10)
              : 'No upcoming due date'}
          </ThemedText>
        </View>
        {(item.days_in_arrears ?? 0) > 0 && (
          <View style={styles.overduePill}>
            <MaterialIcons name="warning" size={14} color="#b91c1c" />
            <ThemedText style={styles.overdueText}>
              {item.days_in_arrears} days in arrears
            </ThemedText>
          </View>
        )}
      </View>
      {onRecord ? (
        <Pressable
          style={styles.recordBtn}
          onPress={(event) => {
            event.stopPropagation?.();
            onRecord();
          }}
        >
          <MaterialIcons name="payments" size={16} color="#fff" />
          <ThemedText style={styles.recordBtnText}>Record repayment</ThemedText>
        </Pressable>
      ) : null}
    </ListCard>
  );
}

export default function StaffRepaymentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const canReverse = useAuthStore((s) => s.hasPermission('loan:approve'));
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const hubCopy = staffRepaymentHubCopy(backendRole);
  const dedicatedFlow = dedicatedStaffRepaymentFlow(backendRole);
  const canCollect = canCollectRepayments(backendRole);
  const opsRecordRole = opsRepaymentRoleFromBackend(backendRole);
  const {
    repayments,
    awaitingVerification,
    dueToday,
    overdue,
    upcoming,
    loading,
    hubLoading,
    lastError,
    fetchRepayments,
    fetchHub,
    clearError,
  } = useRepaymentsStore();
  const { loans, fetchLoans } = useLoansStore();
  const [tab, setTab] = useState<HubTab>(() => normalizeTab(params.tab));
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [repayModalVisible, setRepayModalVisible] = useState(false);
  const [reversalModalVisible, setReversalModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [recordedStatus, setRecordedStatus] = useState<
    'ALL' | 'PAID' | 'AWAITING_VERIFICATION' | 'PENDING' | 'REVERSED'
  >('ALL');

  useEffect(() => {
    setTab(normalizeTab(params.tab));
  }, [params.tab]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const openPicker = () => setPickerVisible(true);
  const onLoanPicked = (loan: Loan) => {
    setPickerVisible(false);
    setSelectedLoan(loan);
    setRepayModalVisible(true);
  };
  const closeRepayModal = () => {
    setRepayModalVisible(false);
    setSelectedLoan(null);
  };
  const refreshAfterRecord = () => {
    void fetchRepayments({ search: debouncedSearch, status: recordedStatus });
    void fetchHub({ search: debouncedSearch });
    void fetchLoans();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchRepayments({ search: debouncedSearch, status: recordedStatus }),
      fetchHub({ search: debouncedSearch }),
      fetchLoans(),
    ]);
    setRefreshing(false);
  }, [debouncedSearch, fetchHub, fetchLoans, fetchRepayments, recordedStatus]);

  useEffect(() => {
    void fetchRepayments({ search: debouncedSearch, status: recordedStatus });
    void fetchHub({ search: debouncedSearch });
    void fetchLoans();
  }, [debouncedSearch, fetchHub, fetchLoans, fetchRepayments, recordedStatus]);

  const hubItems = useMemo(() => {
    if (tab === 'due') return dueToday;
    if (tab === 'overdue') return overdue;
    if (tab === 'upcoming') return upcoming;
    return [];
  }, [tab, dueToday, overdue, upcoming]);

  const awaitingCount = awaitingVerification.length;
  const liveTracks =
    liveTrackingCount(dueToday) + liveTrackingCount(overdue) + liveTrackingCount(upcoming);

  const stats: { label: string; value: string; icon: 'today' | 'warning' | 'sensors' | 'hourglass-empty' }[] = [
    { label: 'Due today', value: String(dueToday.length), icon: 'today' },
    { label: 'Overdue', value: String(overdue.length), icon: 'warning' },
    {
      label: liveTracks > 0 ? 'Live tracks' : 'Awaiting',
      value: String(liveTracks > 0 ? liveTracks : awaitingCount),
      icon: liveTracks > 0 ? 'sensors' : 'hourglass-empty',
    },
  ];

  const tabs: { key: HubTab; label: string; count: number }[] = [
    { key: 'due', label: 'Due today', count: dueToday.length },
    { key: 'overdue', label: 'Overdue', count: overdue.length },
    { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
    { key: 'awaiting', label: 'Awaiting', count: awaitingCount },
    { key: 'recorded', label: 'Recorded', count: repayments.length },
  ];

  const listEmpty =
    tab === 'recorded'
      ? !loading && repayments.length === 0
      : tab === 'awaiting'
        ? !loading && awaitingVerification.length === 0
        : !hubLoading && hubItems.length === 0;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={hubCopy.title}
        subtitle={hubCopy.subtitle}
        icon="payment"
        stats={stats}
      />

      <RepaymentKpiStrip items={overviewToKpis({ due: dueToday, overdue, upcoming })} />

      {dedicatedFlow ? (
        <Pressable style={styles.flowBanner} onPress={() => router.push(dedicatedFlow.href)}>
          <View style={{ flex: 1 }}>
            <ThemedText type="defaultSemiBold">{dedicatedFlow.title}</ThemedText>
            <ThemedText style={styles.flowHint}>{dedicatedFlow.hint}</ThemedText>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={CoFiColors.primary} />
        </Pressable>
      ) : null}

      <View style={styles.tabRow}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.tabChip, active && styles.tabChipActive]}
              onPress={() => setTab(t.key)}
            >
              <ThemedText style={[styles.tabChipText, active && styles.tabChipTextActive]}>
                {t.label}
              </ThemedText>
              <ThemedText style={[styles.tabCount, active && styles.tabChipTextActive]}>
                {t.count}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.filterBar}>
        <MaterialIcons name="search" size={18} color={CoFiColors.mutedForeground} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search loan # or client"
          placeholderTextColor={CoFiColors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {tab === 'recorded' ? (
        <View style={styles.statusRow}>
          {(
            [
              ['ALL', 'All'],
              ['PAID', 'Paid'],
              ['AWAITING_VERIFICATION', 'Awaiting'],
              ['PENDING', 'Draft'],
              ['REVERSED', 'Reversed'],
            ] as const
          ).map(([key, label]) => {
            const active = recordedStatus === key;
            return (
              <Pressable
                key={key}
                style={[styles.statusChip, active && styles.statusChipActive]}
                onPress={() => setRecordedStatus(key)}
              >
                <ThemedText style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {lastError ? (
        <Pressable style={styles.errorBanner} onPress={() => clearError()}>
          <MaterialIcons name="error-outline" size={16} color="#fff" />
          <ThemedText style={styles.errorBannerText}>{lastError}</ThemedText>
        </Pressable>
      ) : null}

      {tab === 'recorded' || tab === 'awaiting' ? (
        <FlatList
          data={tab === 'awaiting' ? awaitingVerification : repayments}
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
            <ThemedText style={styles.pendingHint}>
              {tab === 'awaiting'
                ? dedicatedFlow
                  ? 'Receipts waiting for operations verification. Role-specific posting and escalation live on the dedicated desk above.'
                  : 'Client repayments waiting for Operations verification on BMS.'
                : dedicatedFlow
                  ? 'Recorded payments stay pending until operations confirms them. Use the dedicated desk above for role actions.'
                  : 'Recorded payments stay pending until Operations confirms them on web BMS.'}
            </ThemedText>
          }
          ListEmptyComponent={
            listEmpty ? (
              <ClientEmptyState
                icon="payment"
                title={
                  loading
                    ? 'Loading repayments…'
                    : tab === 'awaiting'
                      ? 'No repayments awaiting verification'
                      : 'No repayments recorded yet'
                }
                message={
                  loading
                    ? 'Please wait while we fetch the latest data.'
                    : tab === 'awaiting'
                      ? 'When clients submit repayments that need ops verification, they appear here.'
                      : canCollect
                        ? 'Record loan collections from clients using the button below.'
                        : 'Receipts recorded by loan officers appear here for ledger review.'
                }
                actionLabel={loading || tab === 'awaiting' || !canCollect ? undefined : 'Record payment'}
                onAction={loading || tab === 'awaiting' || !canCollect ? undefined : openPicker}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <ListCard
              onPress={() =>
                router.push(
                  opsRecordRole
                    ? opsRepaymentRecordHref(item.id, opsRecordRole)
                    : (`/repayments/${item.id}` as const)
                )
              }
            >
              <View style={[listCardStyles.row, styles.cardHeader]}>
                <ThemedText type="defaultSemiBold">{item.loan_account_number}</ThemedText>
                <View style={styles.cardHeaderRight}>
                  {item.sync_status && item.sync_status !== 'synced' && (
                    <SyncStatusBadge status={item.sync_status} />
                  )}
                  <AmountText cents={item.amount} style={styles.amount} />
                </View>
              </View>
              <View style={listCardStyles.divider} />
              <View style={listCardStyles.row}>
                <ThemedText style={listCardStyles.label}>Date</ThemedText>
                <ThemedText>{item.repayment_date}</ThemedText>
              </View>
              <View style={listCardStyles.row}>
                <ThemedText style={listCardStyles.label}>Status</ThemedText>
                <ThemedText>
                  {item.status === 'AWAITING_VERIFICATION'
                    ? 'Awaiting ops verification'
                    : item.status === 'PENDING' || item.status === 'PENDING_CONFIRMATION'
                      ? 'Pending ops confirmation'
                      : item.status}
                </ThemedText>
              </View>
            </ListCard>
          )}
        />
      ) : (
        <FlatList
          data={hubItems}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={CoFiColors.primary}
            />
          }
          ListEmptyComponent={
            listEmpty ? (
              <ClientEmptyState
                icon="event-available"
                title={hubLoading ? 'Loading…' : 'Nothing in this tab'}
                message={
                  hubLoading
                    ? 'Fetching portfolio due/overdue/upcoming loans.'
                    : canCollect
                      ? 'Loans with balances still appear when you record a payment.'
                      : 'Loans with balances still appear here for ledger review.'
                }
                actionLabel={canCollect ? 'Record payment' : undefined}
                onAction={canCollect ? openPicker : undefined}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <HubLoanCard
              item={item}
              onPress={() => router.push(`/loans/${item.id}`)}
              onRecord={
                canCollect
                  ? () => {
                      setSelectedLoan(overviewToStaffLoan(item));
                      setRepayModalVisible(true);
                    }
                  : undefined
              }
            />
          )}
        />
      )}

      {canCollect ? <ClientFab onPress={openPicker} /> : null}
      {canCollect && canReverse ? (
        <ClientFab icon="undo" bottom={92} onPress={() => setReversalModalVisible(true)} />
      ) : null}

      <StaffLoanPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        loans={loans}
        onSelectLoan={onLoanPicked}
      />
      <StaffRepaymentModal
        visible={repayModalVisible}
        loan={selectedLoan}
        onClose={closeRepayModal}
        onRecorded={refreshAfterRecord}
      />
      <RepaymentReversalModal
        visible={reversalModalVisible}
        onClose={() => setReversalModalVisible(false)}
        onReversed={refreshAfterRecord}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  flowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(10,61,122,0.22)',
    backgroundColor: 'rgba(10,61,122,0.06)',
  },
  flowHint: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    backgroundColor: CoFiColors.backgroundCard,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: CoFiColors.foreground,
    paddingVertical: 2,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statusChip: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: CoFiColors.backgroundCard,
  },
  statusChipActive: {
    backgroundColor: CoFiColors.primary,
    borderColor: CoFiColors.primary,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: CoFiColors.foreground,
  },
  statusChipTextActive: {
    color: '#fff',
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.15)',
  },
  tabChipActive: {
    backgroundColor: CoFiColors.primary,
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: CoFiColors.mutedForeground,
  },
  tabChipTextActive: {
    color: '#fff',
  },
  tabCount: {
    fontSize: 11,
    fontWeight: '700',
    color: CoFiColors.mutedForeground,
  },
  pendingHint: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 12,
  },
  cardActive: {
    borderColor: 'rgba(245,158,11,0.6)',
    borderWidth: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitleBlock: {
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  clientName: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  metaText: {
    fontSize: 12,
    opacity: 0.75,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  amountColumn: {
    flex: 1,
  },
  amountValue: {
    ...listCardStyles.value,
    fontSize: 14,
  },
  overduePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  overdueText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '600',
  },
  recordBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: CoFiColors.primary,
  },
  recordBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  list: { padding: 20, paddingTop: 12, paddingBottom: 120 },
  cardHeader: { marginBottom: 4 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amount: { color: '#22c55e' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
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
});
