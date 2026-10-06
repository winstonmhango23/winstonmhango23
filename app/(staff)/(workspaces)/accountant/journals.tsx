import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { LegacyBulkJournalModal } from '@/components/accountant/legacy-bulk-journal-modal';
import { LoanScheduleModal } from '@/components/staff/repayments/loan-schedule-modal';
import { InvestmentAssignmentModal } from '@/components/investment/investment-assignment-modal';
import { ceoFundDisplayName, loanNeedsCeoFundMapping } from '@/lib/accountant-funded-book';
import { ClientChipRow, ClientEmptyState, DesktopOnlyWorkspace, StaffDetailScreen } from '@/components/staff-ui';
import { HorizontalLoanCard } from '@/components/staff/horizontal-loan-card';
import { StatusBadge } from '@/components/ui/list-card';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  apiGetAccountantLoanJournals,
  apiPostAccountantGenerateJournals,
  type ApiAccountantJournalLoan,
  type ApiAccountantJournalPage,
} from '@/lib/data/api';
import { isAccountantStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { staffApplicationWorkspaceHref } from '@/lib/staff/role-queues';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';
import {
  combinedBookCount,
  emptyBookTotals,
  isolateAgriculturalFilter,
  isolateCreditBook,
  loanListSkip,
  nextLoanListPage,
  readBookTotals,
  STAFF_LOAN_PAGE_SIZE,
  type StaffCreditBook,
} from '@/lib/staff/loan-book-filters';
import {
  LOAN_ARCHIVE_PAGE_SIZE,
  LOAN_ARCHIVE_PAGE_SIZE_OPTIONS,
  normalizeLoanArchivePageSize,
} from '@/lib/staff/loan-archives';
import {
  accountantLegacyCardTone,
  canSelectLegacyLoanForJournals,
  emptyBulkJournalProgress,
  isLegacyAccountantCompleted,
  isReadyForAccountantJournals,
  legacyLoanDisplayLabel,
  runBulkLegacyJournals,
  selectableApprovedLegacyLoans,
  sortLegacyBookingCompletedLast,
  type BulkJournalProgress,
} from '@/lib/staff/legacy-booking';

type Book = 'legacy' | 'current';
type CreditBookFilter = 'ALL' | StaffCreditBook;
type LegacyQueue = 'active' | 'archive';

function loanId(row: ApiAccountantJournalLoan): number | null {
  const raw = Number(row.id);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function accountantLegacyRepaymentHint(item: ApiAccountantJournalLoan): string | null {
  const rows = item.repaymentScheduleRows;
  const total = item.repaymentScheduleTotalDueMinor;
  const next = item.nextScheduleDueDate ?? item.nextDueDate;
  const last = item.lastPaymentDate;
  if (rows == null && total == null && !next && !last) return null;
  const bits: string[] = [];
  if (rows != null) bits.push(`${rows} payment${rows === 1 ? '' : 's'} scheduled`);
  if (total != null) bits.push(formatMinorMWK(total));
  if (next) bits.push(`next ${formatShortDate(next)}`);
  if (last) bits.push(`paid ${formatShortDate(last)}`);
  return bits.join(' · ');
}

export default function AccountantJournalsScreen() {
  const router = useRouter();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isAccountantStaffRole(backendRole) || backendRoleMatches(backendRole, ['ACCOUNTANT', 'ADMIN']);
  const params = useLocalSearchParams<{ book?: string; credit_book?: string; agri?: string }>();
  const requestedBook = params.book === 'current' ? 'current' : 'legacy';
  const requestedCreditBook = isolateCreditBook(params.credit_book) ?? 'ALL';
  const requestedAgricultural = isolateAgriculturalFilter(params.agri);
  const [book, setBook] = useState<Book>(requestedBook);
  const [legacyQueue, setLegacyQueue] = useState<LegacyQueue>('active');
  const isArchive = book === 'legacy' && legacyQueue === 'archive';
  const [creditBook, setCreditBook] = useState<CreditBookFilter>(requestedCreditBook);
  const [isAgricultural, setIsAgricultural] = useState(requestedAgricultural);
  const [items, setItems] = useState<ApiAccountantJournalLoan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(STAFF_LOAN_PAGE_SIZE);
  const [pages, setPages] = useState(1);
  const [bookTotals, setBookTotals] = useState(emptyBookTotals());
  const [pipeline, setPipeline] = useState<ApiAccountantJournalPage['pipeline_counts']>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkVisible, setBulkVisible] = useState(false);
  const [bulkPhase, setBulkPhase] = useState<'confirm' | 'running' | 'complete'>('confirm');
  const [bulkProgress, setBulkProgress] = useState<BulkJournalProgress>(emptyBulkJournalProgress());
  const [bulkLabels, setBulkLabels] = useState<string[]>([]);
  const [assignLoanId, setAssignLoanId] = useState<number | null>(null);
  const [scheduleLoanId, setScheduleLoanId] = useState<number | null>(null);

  const isolatedBook = isolateCreditBook(creditBook === 'ALL' ? null : creditBook);
  const visibleItems = useMemo(
    () => (book === 'legacy' ? sortLegacyBookingCompletedLast(items) : items),
    [book, items]
  );

  const load = useCallback(async (nextPage = 1, append = false) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      if (append) setLoadingMore(true);
      const result = await apiGetAccountantLoanJournals(auth.token, {
        book,
        skip: loanListSkip(nextPage, pageSize),
        limit: pageSize,
        credit_book: isArchive ? undefined : isolatedBook,
        is_agricultural: isArchive ? undefined : isAgricultural || undefined,
        queue: book === 'legacy' ? legacyQueue : undefined,
      });
      const rows = result.loans ?? [];
      setItems((prev) => (append ? [...prev, ...rows] : rows));
      setTotal(result.total ?? 0);
      setPage(result.page ?? nextPage);
      setPages(result.pages ?? Math.max(1, Math.ceil((result.total ?? 0) / pageSize)));
      setBookTotals(readBookTotals(result.book_totals));
      setPipeline(result.pipeline_counts ?? {});
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [book, isolatedBook, isAgricultural, isArchive, legacyQueue, pageSize]);

  useEffect(() => {
    setBook(requestedBook);
    setCreditBook(requestedCreditBook);
    setIsAgricultural(requestedAgricultural);
    setPage(1);
    setSelectMode(false);
    setSelectedIds([]);
  }, [requestedBook, requestedCreditBook, requestedAgricultural]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const approvedOnPage = useMemo(
    () => (book === 'current' ? [] : selectableApprovedLegacyLoans(items)),
    [book, items]
  );
  const selectedLoans = useMemo(
    () =>
      items.filter((row) => {
        const id = loanId(row);
        return id != null && selectedIds.includes(id) && canSelectLegacyLoanForJournals(row);
      }),
    [items, selectedIds]
  );
  const showSelectToggle = book !== 'current' && !isArchive;
  const assignRow = useMemo(
    () => items.find((row) => loanId(row) === assignLoanId) ?? null,
    [assignLoanId, items]
  );

  const generate = async (row: ApiAccountantJournalLoan) => {
    const id = loanId(row);
    if (id == null) return;
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBusyId(id);
    try {
      await apiPostAccountantGenerateJournals(auth.token, id);
      Alert.alert('Journals posted', 'GL journal entries were generated for this loan.');
      await load(1);
    } catch (e) {
      Alert.alert('Could not generate journals', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleSelectMode = (enabled: boolean) => {
    setSelectMode(enabled);
    if (!enabled) setSelectedIds([]);
  };

  const toggleLoan = (row: ApiAccountantJournalLoan) => {
    const id = loanId(row);
    if (id == null || !canSelectLegacyLoanForJournals(row)) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const startBulk = () => {
    if (selectedLoans.length === 0) return;
    setBulkLabels(selectedLoans.map(legacyLoanDisplayLabel));
    setBulkProgress(emptyBulkJournalProgress(selectedLoans.length));
    setBulkPhase('confirm');
    setBulkVisible(true);
  };

  const runBulk = async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setBulkPhase('running');
    const result = await runBulkLegacyJournals({
      loans: selectedLoans,
      generate: async (id) => {
        const data = (await apiPostAccountantGenerateJournals(auth.token, id)) as {
          legacy_booking_status?: string | null;
          status?: string | null;
        };
        const nextStatus = data?.legacy_booking_status || data?.status || 'booked';
        setItems((prev) =>
          prev.map((row) => (loanId(row) === id ? { ...row, legacyBookingStatus: nextStatus } : row))
        );
        return data;
      },
      onProgress: setBulkProgress,
    });
    setBulkProgress(result);
    setBulkPhase('complete');
    setSelectedIds([]);
    setSelectMode(false);
  };

  const closeBulk = async () => {
    if (bulkPhase === 'running') return;
    setBulkVisible(false);
    setBulkPhase('confirm');
    await load(1);
  };

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Legacy Booking"
        message={desktopOnlyWorkspaceMessage('Accountant shell')}
      />
    );
  }

  return (
    <StaffDetailScreen
      title={
        book === 'current'
          ? 'Current Journals'
          : isArchive
            ? 'Legacy archive'
            : 'Legacy Booking'
      }
      subtitle={
        isArchive
          ? `${total} accountant-journaled loan${total === 1 ? '' : 's'} with MWK 0 remaining (SME + Group)`
          : book === 'legacy'
            ? `${total} ${isolatedBook ? isolatedBook.toLowerCase() + ' ' : ''}loan${total === 1 ? '' : 's'} ready for journal entries`
            : `${total} ${isolatedBook ? isolatedBook.toLowerCase() : ''} current loan${total === 1 ? '' : 's'} needing GL booking`
      }
      noPadding
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <View style={styles.chips}>
        <ClientChipRow
          options={[
            { key: 'legacy', label: 'Legacy' },
            { key: 'current', label: 'Current' },
          ]}
          value={book}
          onChange={(key) => {
            setBook(key as Book);
            setLegacyQueue('active');
            setPage(1);
            setSelectMode(false);
            setSelectedIds([]);
          }}
        />
        {book === 'legacy' ? (
          <ClientChipRow
            options={[
              { key: 'active', label: 'Active queue' },
              { key: 'archive', label: 'Archive' },
            ]}
            value={legacyQueue}
            onChange={(key) => {
              setLegacyQueue(key === 'archive' ? 'archive' : 'active');
              setPageSize(key === 'archive' ? LOAN_ARCHIVE_PAGE_SIZE : STAFF_LOAN_PAGE_SIZE);
              setPage(1);
              setSelectMode(false);
              setSelectedIds([]);
            }}
          />
        ) : null}
        {isArchive ? (
          <ClientChipRow
            options={LOAN_ARCHIVE_PAGE_SIZE_OPTIONS.map((size) => ({
              key: String(size),
              label: `${size} / page`,
            }))}
            value={String(pageSize)}
            onChange={(key) => {
              setPageSize(normalizeLoanArchivePageSize(key));
              setPage(1);
            }}
          />
        ) : null}
        {isArchive ? null : (
        <ClientChipRow
          options={[
            { key: 'ALL', label: `All books${combinedBookCount(bookTotals) ? ` (${combinedBookCount(bookTotals)})` : ''}` },
            { key: 'SME', label: `SME${bookTotals.sme ? ` (${bookTotals.sme})` : ''}` },
            { key: 'GROUP', label: `Group${bookTotals.group ? ` (${bookTotals.group})` : ''}` },
          ]}
          value={creditBook}
          onChange={(key) => {
            setCreditBook(key as CreditBookFilter);
            setPage(1);
          }}
        />
        )}
        {isArchive ? null : (
        <ClientChipRow
          options={[
            { key: 'off', label: 'All products' },
            { key: 'on', label: `Agricultural${bookTotals.agricultural ? ` (${bookTotals.agricultural})` : ''}` },
          ]}
          value={isAgricultural ? 'on' : 'off'}
          onChange={(key) => {
            setIsAgricultural(key === 'on');
            setPage(1);
          }}
        />
        )}
        {book === 'legacy' && !isArchive && (pipeline?.ops_queue || pipeline?.journal_ready) ? (
          <ThemedText style={styles.selectHint}>
            Ops queue {pipeline?.ops_queue ?? 0} · awaiting ops {pipeline?.awaiting_operations ?? 0} ·
            ready for journals {pipeline?.journal_ready ?? 0}
            {pipeline?.certified_not_handed_off
              ? ` · certified not handed over ${pipeline.certified_not_handed_off}`
              : ''}
            .
          </ThemedText>
        ) : null}
        {showSelectToggle ? (
          <View style={styles.selectBar}>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">Multi-select ready</ThemedText>
              <ThemedText style={styles.selectHint}>
                Tap a green-outlined ready card to select it
              </ThemedText>
            </View>
            <Switch
              value={selectMode}
              onValueChange={toggleSelectMode}
              trackColor={{ true: CoFiColors.primary }}
            />
          </View>
        ) : null}
        {selectMode ? (
          <Pressable
            style={styles.selectAll}
            onPress={() => {
              const ids = approvedOnPage
                .map((row) => loanId(row))
                .filter((id): id is number => id != null);
              setSelectedIds(ids);
            }}
          >
            <ThemedText style={styles.selectAllText}>
              Select all approved on this page ({approvedOnPage.length})
            </ThemedText>
          </Pressable>
        ) : null}
        {selectMode ? (
          <Pressable
            style={[styles.bulkBtn, selectedLoans.length === 0 && styles.bulkBtnDisabled]}
            disabled={selectedLoans.length === 0 || bulkPhase === 'running'}
            onPress={startBulk}
          >
            <MaterialIcons name="post-add" size={18} color="#fff" />
            <ThemedText style={styles.openText}>
              Create journals ({selectedLoans.length})
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        style={{ flex: 1 }}
        data={visibleItems}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={styles.list}
        onEndReached={() => {
          const next = nextLoanListPage(page, pages);
          if (next == null || loadingMore) return;
          void load(next, true);
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={CoFiColors.primary} style={{ marginVertical: 12 }} /> : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(1)} tintColor={CoFiColors.primary} />
        }
        ListEmptyComponent={
          <ClientEmptyState
            icon="menu-book"
            title={loading ? 'Loading journals…' : 'No journals pending'}
            message={
              loading
                ? 'Fetching legacy and current funded loans.'
                : book === 'legacy'
                  ? 'Only operations-handed loans ready for journal entries appear here. Schedule generation alone is not enough.'
                  : 'Loans that still need GL journals will appear here.'
            }
          />
        }
        renderItem={({ item }) => {
          const id = loanId(item);
          const name = item.customerName || item.client_name || 'Loan';
          const ref = item.applicationNumber || item.application_number;
          const amount = item.outstandingBalanceMinor ?? item.originalPrincipalMinor ?? 0;
          const status = item.legacyBookingStatus || item.status;
          const completed = isLegacyAccountantCompleted(item);
          const ready = book === 'legacy' ? isReadyForAccountantJournals(item) : true;
          const selectable = showSelectToggle && canSelectLegacyLoanForJournals(item);
          const selected = id != null && selectedIds.includes(id);
          const needsInvestment = loanNeedsCeoFundMapping(item);
          const investmentName = ceoFundDisplayName(item);
          const tone =
            book === 'legacy'
              ? accountantLegacyCardTone(item)
              : completed
                ? 'completed'
                : 'ready';
          const openLoan = () => {
            if (item.loan_application_id) {
              router.push(staffApplicationWorkspaceHref(item.loan_application_id));
              return;
            }
            if (id != null) router.push(`/(staff)/loans/${id}` as Href);
          };
          const scheduleHint =
            book === 'legacy' ? accountantLegacyRepaymentHint(item) : 'Open the full repayment schedule';
          return (
            <HorizontalLoanCard
              title={name}
              subtitle={[ref, item.productName || item.product_name].filter(Boolean).join(' · ') || null}
              meta={
                [
                  item.journalPendingReason
                    ? String(item.journalPendingReason)
                    : needsInvestment
                      ? 'Needs investment'
                      : `Investment: ${investmentName ?? 'Assigned'}`,
                  scheduleHint,
                ]
                  .filter(Boolean)
                  .join(' · ') || null
              }
              amountCents={amount}
              tone={tone}
              selectMode={selectMode}
              selectable={selectable}
              selected={selected}
              onPress={selectMode ? (selectable ? () => toggleLoan(item) : undefined) : openLoan}
              badge={
                completed ? (
                  <View style={styles.completedBadge}>
                    <MaterialIcons name="check-circle" size={14} color="#047857" />
                    <ThemedText style={styles.completedText}>Completed</ThemedText>
                  </View>
                ) : status ? (
                  <StatusBadge status={status} type="application" />
                ) : null
              }
              footer={
                !selectMode && (ready || completed || needsInvestment || id != null) ? (
                  <View style={styles.actions}>
                    {id != null ? (
                      <TouchableOpacity
                        style={styles.scheduleBtn}
                        onPress={() => setScheduleLoanId(id)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="calendar-month" size={16} color={CoFiColors.primary} />
                        <ThemedText style={styles.scheduleText}>View schedule</ThemedText>
                      </TouchableOpacity>
                    ) : null}
                    {needsInvestment && id != null ? (
                      <TouchableOpacity
                        style={styles.assignBtn}
                        onPress={() => setAssignLoanId(id)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="account-balance" size={16} color={CoFiColors.primary} />
                        <ThemedText style={styles.assignText}>Assign investment</ThemedText>
                      </TouchableOpacity>
                    ) : null}
                    {completed ? (
                      <View style={styles.completedRow}>
                        <MaterialIcons name="check-circle" size={16} color="#047857" />
                        <ThemedText style={styles.completedText}>Journal entries posted</ThemedText>
                      </View>
                    ) : ready && id != null ? (
                      <TouchableOpacity
                        style={styles.generateBtn}
                        onPress={() => void generate(item)}
                        disabled={busyId === id || bulkPhase === 'running'}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="post-add" size={16} color="#fff" />
                        <ThemedText style={styles.openText}>
                          {busyId === id ? 'Posting…' : 'Generate journals'}
                        </ThemedText>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null
              }
            />
          );
        }}
      />
      <LoanScheduleModal
        visible={scheduleLoanId != null}
        loanId={scheduleLoanId}
        title={
          items.find((row) => loanId(row) === scheduleLoanId)?.applicationNumber ||
          items.find((row) => loanId(row) === scheduleLoanId)?.application_number ||
          'Loan details'
        }
        subtitle={
          items.find((row) => loanId(row) === scheduleLoanId)?.customerName ||
          items.find((row) => loanId(row) === scheduleLoanId)?.client_name ||
          undefined
        }
        allowReturnForCorrection={
          scheduleLoanId != null &&
          !isArchive &&
          !isLegacyAccountantCompleted(
            items.find((row) => loanId(row) === scheduleLoanId) ?? {}
          )
        }
        onClose={() => setScheduleLoanId(null)}
        onReturned={() => {
          setScheduleLoanId(null);
          void load(1);
        }}
      />
      <InvestmentAssignmentModal
        target={
          assignLoanId != null
            ? {
                loanId: assignLoanId,
                accountNumber: String(
                  assignRow?.applicationNumber || assignRow?.application_number || assignLoanId
                ),
                clientName: assignRow?.customerName || assignRow?.client_name || 'Loan',
                allocationId: assignRow?.allocationId,
              }
            : null
        }
        open={assignLoanId != null}
        onClose={() => setAssignLoanId(null)}
        onAssigned={(result) => {
          setItems((prev) =>
            prev.map((row) =>
              loanId(row) === result.loan_id
                ? {
                    ...row,
                    allocationId: result.allocation_id,
                    fundingFundName: result.funding_fund_name ?? result.fundingFundName,
                    investment_assigned: result.investment_assigned ?? true,
                    investmentAssigned: result.investment_assigned ?? true,
                  }
                : row
            )
          );
        }}
      />
      <LegacyBulkJournalModal
        visible={bulkVisible}
        phase={bulkPhase}
        selectedCount={bulkLabels.length || selectedLoans.length || bulkProgress.total}
        selectedLabels={bulkLabels}
        progress={bulkProgress}
        onCancel={() => void closeBulk()}
        onConfirm={() => void runBulk()}
        onClose={() => void closeBulk()}
      />
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 10 },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  selectHint: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  bulkBtnDisabled: { opacity: 0.5 },
  selectAll: { alignItems: 'flex-start' },
  selectAllText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 13 },
  list: { padding: 16, paddingTop: 12, paddingBottom: 32, gap: 8 },
  actions: { gap: 6 },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  scheduleText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 14 },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  assignText: { color: CoFiColors.primary, fontWeight: '600', fontSize: 14 },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoFiColors.primary,
    paddingVertical: 10,
    borderRadius: 8,
  },
  openText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  completedText: { color: '#047857', fontWeight: '700', fontSize: 12 },
});
