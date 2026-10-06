import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { RoleActionList, type RoleActionItem } from '@/components/staff/role-action-list';
import {
  CurrentBookChips,
  LegacyBookChips,
  useCurrentRepaymentLoans,
  useDebouncedSearch,
  useLegacyRepaymentBook,
} from '@/components/staff/repayments/legacy-repayment-book';
import { LoanScheduleModal } from '@/components/staff/repayments/loan-schedule-modal';
import { RepaymentKpiStrip } from '@/components/staff/repayments/repayment-kpi-strip';
import { ClientEmptyState, DesktopOnlyWorkspace, StaffDetailScreen } from '@/components/staff-ui';
import { AmountText } from '@/components/ui/amount-text';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiGetAccountantPendingRepayments,
  apiPostAccountantFinalizeAllRepayments,
  apiPostAccountantFinalizeRepayments,
  type ApiAccountantPendingRepayment,
} from '@/lib/data/api';
import { isAccountantStaffRole } from '@/lib/loan-origination/origination-workflow';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { opsRepaymentRecordHref } from '@/lib/ops-records';
import { repaymentStatusLabel } from '@/lib/staff/repayment-flows';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

function summarizeFinalize(result: { finalized_count?: number; failed_count?: number; message?: string; detail?: string }) {
  const finalized = result.finalized_count ?? 0;
  const failed = result.failed_count ?? 0;
  if (result.message && finalized === 0 && failed === 0) return result.message;
  return `Posted ${finalized} receipt${finalized === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}`;
}

export default function AccountantRepaymentsScreen() {
  const router = useRouter();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isAccountantStaffRole(backendRole) || backendRoleMatches(backendRole, ['ACCOUNTANT', 'ADMIN']);
  const [rows, setRows] = useState<ApiAccountantPendingRepayment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { search, setSearch, debounced } = useDebouncedSearch();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [desk, setDesk] = useState<'current' | 'legacy' | 'pending'>('current');
  const [scheduleItem, setScheduleItem] = useState<RoleActionItem | null>(null);
  const book = useLegacyRepaymentBook(debounced);
  const current = useCurrentRepaymentLoans(debounced);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const page = await apiGetAccountantPendingRepayments(auth.token, {
        limit: 80,
        search: debounced || undefined,
      });
      setRows(page.items);
      setTotal(page.total);
      setSelected((prev) => prev.filter((id) => page.items.some((row) => row.repayment_id === id)));
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const pendingAmount = useMemo(
    () => rows.reduce((sum, row) => sum + (row.total_amount_minor ?? 0), 0),
    [rows]
  );

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const finalizeIds = async (ids: number[]) => {
    const auth = await getStoredAuth();
    if (!auth?.token || ids.length === 0) return;
    setBusy(true);
    try {
      const result = await apiPostAccountantFinalizeRepayments(
        auth.token,
        ids,
        'Finalized from mobile accountant workspace'
      );
      Alert.alert('Ledger posted', summarizeFinalize(result));
      setSelected([]);
      await load();
    } catch (error) {
      Alert.alert('Could not finalize', error instanceof Error ? error.message : 'Try again from BMS.');
    } finally {
      setBusy(false);
    }
  };

  const confirmFinalize = (ids: number[], label: string) => {
    if (ids.length === 0) return;
    Alert.alert(
      label,
      `Post ${ids.length} manager-approved receipt${ids.length === 1 ? '' : 's'} to the general ledger?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Finalize', onPress: () => void finalizeIds(ids) },
      ]
    );
  };

  const confirmFinalizeAll = () => {
    Alert.alert(
      'Finalize all pending',
      'Post every manager-approved receipt in this branch to the general ledger?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalize all',
          onPress: () => {
            void (async () => {
              const auth = await getStoredAuth();
              if (!auth?.token) return;
              setBusy(true);
              try {
                const result = await apiPostAccountantFinalizeAllRepayments(auth.token);
                Alert.alert('Ledger posted', summarizeFinalize(result));
                setSelected([]);
                await load();
              } catch (error) {
                Alert.alert(
                  'Could not finalize',
                  error instanceof Error ? error.message : 'Try again from BMS.'
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Accountant repayments"
        message={desktopOnlyWorkspaceMessage('Accountant shell')}
      />
    );
  }

  const showingCurrent = desk === 'current';
  const showingBook = desk === 'legacy';
  const loanDesk = showingCurrent || showingBook;

  const deskChips = (
    <View style={styles.chipRow}>
      {(
        [
          ['current', 'Current loans'],
          ['legacy', 'Legacy book'],
          ['pending', 'Pending GL'],
        ] as const
      ).map(([key, label]) => {
        const active = desk === key;
        return (
          <Pressable
            key={key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => setDesk(key)}
          >
            <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  if (loanDesk) {
    return (
      <>
        <RoleActionList
          title={showingCurrent ? 'Current loans' : 'Legacy repayment book'}
          subtitle={
            showingCurrent
              ? 'Originated loans that are overdue, due today, or upcoming. Accountants review the schedule — operations record collections.'
              : 'Outstanding SME and Group legacy loans with schedules. Agricultural is a subcategory. Overdue and due today sit first.'
          }
          emptyTitle={showingCurrent ? current.emptyTitle : book.emptyTitle}
          emptyMessage={
            showingCurrent
              ? 'Due, overdue, and upcoming originated loans appear here for schedule review.'
              : book.emptyMessage
          }
          items={showingCurrent ? current.items : book.items}
          loading={showingCurrent ? current.loading : book.loading}
          onRefresh={async () => {
            await Promise.all([current.load(), book.load(), load()]);
          }}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Loan number or client name"
          openLabel="View schedule"
          onOpen={(item) => setScheduleItem(item)}
          header={
            <>
              {deskChips}
              {showingCurrent ? (
                <CurrentBookChips
                  bucket={current.bucket}
                  counts={current.counts}
                  onChange={current.setBucket}
                />
              ) : (
                <LegacyBookChips book={book.book} totals={book.totals} onChange={book.setBook} />
              )}
            </>
          }
        />
        <LoanScheduleModal
          visible={scheduleItem != null}
          loanId={scheduleItem?.loanId ?? (scheduleItem ? Number(scheduleItem.id) : null)}
          title={scheduleItem?.title}
          subtitle={scheduleItem?.subtitle}
          onClose={() => setScheduleItem(null)}
        />
      </>
    );
  }

  return (
    <StaffDetailScreen
      title="Pending GL finalization"
      subtitle={`${total} manager-approved receipt${total === 1 ? '' : 's'} awaiting the ledger`}
      noPadding
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([load(), book.load()]);
        setRefreshing(false);
      }}
    >
      {deskChips}
      <RepaymentKpiStrip
        items={[
          { label: 'Pending', value: String(total) },
          { label: 'Queue amount', value: formatMinorMWK(pendingAmount), tone: 'accent' },
          { label: 'Selected', value: String(selected.length), tone: selected.length ? 'success' : 'default' },
        ]}
      />
      <View style={styles.filterBar}>
        <MaterialIcons name="search" size={18} color={CoFiColors.mutedForeground} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search client, loan, or receipt"
          placeholderTextColor={CoFiColors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <View style={styles.batchRow}>
        <Pressable
          style={styles.batchBtn}
          onPress={() => setSelected(rows.map((row) => row.repayment_id))}
        >
          <ThemedText style={styles.batchText}>Select all</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.batchBtn, styles.primaryBtn, (busy || selected.length === 0) && styles.disabled]}
          disabled={busy || selected.length === 0}
          onPress={() => confirmFinalize(selected, 'Finalize selected')}
        >
          <ThemedText style={styles.primaryText}>Finalize selected</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.batchBtn, styles.dangerBtn, (busy || rows.length === 0) && styles.disabled]}
          disabled={busy || rows.length === 0}
          onPress={confirmFinalizeAll}
        >
          <ThemedText style={styles.primaryText}>Finalize all</ThemedText>
        </Pressable>
      </View>
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(item) => String(item.repayment_id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={CoFiColors.primary}
          />
        }
        ListEmptyComponent={
          <ClientEmptyState
            icon="check-circle"
            title={loading ? 'Loading pending receipts…' : 'Ledger queue clear'}
            message={
              loading
                ? 'Fetching manager-approved repayments.'
                : 'When operations approve a receipt, it lands here for GL posting.'
            }
          />
        }
        renderItem={({ item }) => {
          const checked = selected.includes(item.repayment_id);
          return (
            <View style={[styles.card, checked && styles.cardSelected]}>
              <Pressable style={styles.cardTop} onPress={() => toggle(item.repayment_id)}>
                <MaterialIcons
                  name={checked ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={checked ? CoFiColors.primary : CoFiColors.mutedForeground}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText type="defaultSemiBold">
                    {item.client_name?.trim() || item.loan_account_number || `Receipt #${item.repayment_id}`}
                  </ThemedText>
                  <ThemedText style={styles.meta}>
                    {[
                      item.loan_account_number,
                      item.receipt_number,
                      repaymentStatusLabel(item.lifecycle_state || item.manager_approval_status),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                  {item.days_since_approval != null ? (
                    <ThemedText style={styles.meta}>
                      Approved {item.days_since_approval} day{item.days_since_approval === 1 ? '' : 's'} ago
                    </ThemedText>
                  ) : null}
                </View>
                <AmountText cents={item.total_amount_minor} style={styles.amount} />
              </Pressable>
              <View style={styles.actions}>
                <Pressable
                  style={styles.openBtn}
                  onPress={() => router.push(opsRepaymentRecordHref(item.repayment_id, 'officer'))}
                >
                  <MaterialIcons name="open-in-new" size={16} color="#fff" />
                  <ThemedText style={styles.openText}>View record</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, busy && styles.disabled]}
                  disabled={busy}
                  onPress={() => confirmFinalize([item.repayment_id], 'Finalize receipt')}
                >
                  <ThemedText style={styles.actionText}>Finalize</ThemedText>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: CoFiColors.backgroundCard,
  },
  chipActive: {
    backgroundColor: CoFiColors.primary,
    borderColor: CoFiColors.primary,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: CoFiColors.foreground },
  chipTextActive: { color: '#fff' },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 10,
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
  batchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  batchBtn: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: CoFiColors.backgroundCard,
  },
  primaryBtn: {
    backgroundColor: CoFiColors.primary,
    borderColor: CoFiColors.primary,
  },
  dangerBtn: {
    backgroundColor: '#0a4a8f',
    borderColor: '#0a4a8f',
  },
  disabled: { opacity: 0.45 },
  batchText: { fontSize: 12, fontWeight: '600' },
  primaryText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  list: { padding: 20, paddingTop: 8, paddingBottom: 32, gap: 12 },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    gap: 10,
  },
  cardSelected: {
    borderColor: CoFiColors.primary,
    backgroundColor: 'rgba(10,61,122,0.04)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  meta: { fontSize: 12, opacity: 0.65, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700', color: CoFiColors.primary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoFiColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  openText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  actionText: { fontWeight: '600', fontSize: 13 },
});
