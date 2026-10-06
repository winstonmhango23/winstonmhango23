import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { formatAmount } from '@/components/ui/amount-text';
import { StatusBadge } from '@/components/ui/list-card';
import { HorizontalLoanCard } from '@/components/staff/horizontal-loan-card';
import { CreditBookBadges } from '@/components/staff/credit-book-badges';
import { ClientChipRow, ClientEmptyState } from '@/components/staff-ui';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import { useLoansStore } from '@/store/loans';
import { useAuthStore } from '@/store/auth';
import { LastSyncedHint } from '@/components/ui/last-synced-hint';
import {
  creditBookLabel,
  isCreditOfficerStaffRole,
  isPortfolioManagerStaffRole,
  isAccountantStaffRole,
  isCeoStaffRole,
  isGceoStaffRole,
  isOperationsStaffRole,
  normalizeCreditBook,
} from '@/lib/loan-origination/origination-workflow';
import { ceoFundDisplayName, loanNeedsCeoFundMapping } from '@/lib/accountant-funded-book';
import { InvestmentAssignmentModal } from '@/components/investment/investment-assignment-modal';
import {
  canAssignLoanInvestment,
  canViewLoanInvestmentAssignment,
} from '@/lib/investment-assignment';
import {
  accountantLegacyCardTone,
  isLegacyAccountantCompleted,
  sortLegacyBookingCompletedLast,
} from '@/lib/staff/legacy-booking';
import {
  combinedBookCount,
  isolateAgriculturalFilter,
  isolateCreditBook,
  nextLoanListPage,
  vintageToLegacyFlag,
  type StaffLoanVintage,
} from '@/lib/staff/loan-book-filters';
import {
  LOAN_ARCHIVE_PAGE_SIZE,
  LOAN_ARCHIVE_PAGE_SIZE_OPTIONS,
  normalizeLoanArchivePageSize,
} from '@/lib/staff/loan-archives';
import {
  isOpsLegacyWorkQueue,
  normalizeOpsLegacyQueue,
  type OpsLegacyQueue,
} from '@/lib/staff/ops-legacy-queue';

type LoanQueue = 'all' | 'pending_disbursement' | 'arrears';

const PENDING_DISBURSEMENT_STATUSES = new Set([
  'APPROVED',
  'PENDING_DISBURSEMENT',
  'READY_FOR_DISBURSEMENT',
  'AWAITING_DISBURSEMENT',
]);

function normalizeQueue(raw: string | string[] | undefined): LoanQueue {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'pending_disbursement' || value === 'arrears') return value;
  return 'all';
}

function normalizeVintage(raw: string | string[] | undefined): StaffLoanVintage {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'legacy' || value === 'recent') return value;
  return 'all';
}

export default function StaffLoansScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ queue?: string; book?: string; vintage?: string; agri?: string }>();
  const { loans, lastSyncedAt, fetchStaffAssignedLoans, updateLoan, total, pages, page, loadingMore, bookTotals } =
    useLoansStore();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const userBook = useAuthStore((s) => s.user?.creditBook);
  const isCio = isCreditOfficerStaffRole(backendRole);
  const isPm = isPortfolioManagerStaffRole(backendRole);
  const isAccountant = isAccountantStaffRole(backendRole);
  const canViewInvestment = canViewLoanInvestmentAssignment(backendRole);
  const canAssignInvestment = canAssignLoanInvestment(backendRole);
  const [assignLoanId, setAssignLoanId] = useState<number | null>(null);
  const isBranchWideBook =
    isPm || isAccountant || isOperationsStaffRole(backendRole) || isCeoStaffRole(backendRole) || isGceoStaffRole(backendRole);
  const creditBook =
    isolateCreditBook(params.book) ??
    (isCio ? isolateCreditBook(userBook) ?? normalizeCreditBook(userBook) ?? undefined : undefined);
  const isAgricultural = isolateAgriculturalFilter(params.agri);
  const [refreshing, setRefreshing] = useState(false);
  const [queue, setQueue] = useState<LoanQueue>(() => normalizeQueue(params.queue));
  const [vintage, setVintage] = useState<StaffLoanVintage>(() => normalizeVintage(params.vintage));
  const [legacyQueue, setLegacyQueue] = useState<OpsLegacyQueue>('needs_verification');
  const [hasBalance, setHasBalance] = useState<boolean | undefined>(undefined);
  const [pageSize, setPageSize] = useState(LOAN_ARCHIVE_PAGE_SIZE);
  const isOpsLegacy = isOperationsStaffRole(backendRole) && vintage === 'legacy';
  const isArchive = isOpsLegacy && !isOpsLegacyWorkQueue(legacyQueue);

  useEffect(() => {
    setQueue(normalizeQueue(params.queue));
  }, [params.queue]);

  useEffect(() => {
    setVintage(normalizeVintage(params.vintage));
  }, [params.vintage]);

  const listOpts = useMemo(
    () => ({
      creditBook: isArchive ? undefined : creditBook ?? undefined,
      isAgricultural: isArchive ? undefined : isAgricultural || undefined,
      isLegacy: vintageToLegacyFlag(vintage),
      legacyQueue: isOpsLegacy ? legacyQueue : undefined,
      hasBalance: isOpsLegacy && !isArchive ? hasBalance : undefined,
      includeFundingPreview: canViewInvestment,
      limit: isArchive ? pageSize : 20,
    }),
    [creditBook, isAgricultural, vintage, canViewInvestment, isArchive, isOpsLegacy, legacyQueue, hasBalance, pageSize]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStaffAssignedLoans({ ...listOpts, page: 1 });
    setRefreshing(false);
  }, [fetchStaffAssignedLoans, listOpts]);

  useEffect(() => {
    fetchStaffAssignedLoans({ ...listOpts, page: 1 });
  }, [fetchStaffAssignedLoans, listOpts]);

  const visibleLoans = useMemo(() => {
    const queued =
      queue === 'pending_disbursement'
        ? loans.filter((l) => PENDING_DISBURSEMENT_STATUSES.has((l.status || '').toUpperCase()))
        : queue === 'arrears'
          ? loans.filter((l) => (l.days_in_arrears ?? 0) > 0)
          : loans;
    if (vintage === 'legacy' || isAccountant || isOperationsStaffRole(backendRole)) {
      return sortLegacyBookingCompletedLast(queued);
    }
    return queued;
  }, [loans, queue, vintage, isAccountant, backendRole]);

  const totalOutstanding = visibleLoans.reduce((s, l) => s + l.outstanding_principal, 0);
  const inArrears = loans.filter((l) => l.days_in_arrears > 0).length;
  const bookTitle = creditBook ? `${creditBookLabel(creditBook)} Loans` : isCio ? 'Supervised loans' : isBranchWideBook ? 'All loans' : 'My Portfolio Loans';
  const vintageLabel = vintage === 'legacy' ? 'legacy' : vintage === 'recent' ? 'recent' : '';

  const stats = [
    { label: 'Loans', value: String(total || visibleLoans.length), icon: 'account-balance' as const },
    { label: 'Outstanding', value: formatAmount(totalOutstanding), icon: 'payments' as const },
    ...(inArrears > 0 ? [{ label: 'In Arrears', value: String(inArrears), icon: 'warning' as const }] : []),
  ];

  const empty = loans.length === 0;
  const assignLoan = assignLoanId != null ? loans.find((row) => row.id === assignLoanId) : undefined;

  const body = (
    <>
      <ScreenHeader
        title={bookTitle}
        subtitle={
          queue === 'pending_disbursement'
            ? 'Approved loans awaiting disbursement'
            : creditBook
              ? `${vintageLabel ? `${vintageLabel} ` : ''}loans isolated on the ${creditBookLabel(creditBook)} book`
              : isCio
                ? 'Supervised and self-originated loans, isolated by credit book'
                : 'Funded book filtered by SME or Group identity (loan id, name, or product)'
        }
        icon="account-balance"
        stats={stats}
      />
      <View style={styles.queueBar}>
        {isArchive ? null : (
        <ClientChipRow
          options={[
            { key: 'ALL', label: `All books${combinedBookCount(bookTotals) ? ` (${combinedBookCount(bookTotals)})` : ''}` },
            { key: 'SME', label: `SME${bookTotals.sme ? ` (${bookTotals.sme})` : ''}` },
            { key: 'GROUP', label: `Group${bookTotals.group ? ` (${bookTotals.group})` : ''}` },
          ]}
          value={creditBook ?? 'ALL'}
          onChange={(key) => router.setParams({ book: key === 'ALL' ? '' : key })}
        />
        )}
        {isArchive ? null : (
        <ClientChipRow
          options={[
            { key: 'off', label: 'All products' },
            { key: 'on', label: `Agricultural${bookTotals.agricultural ? ` (${bookTotals.agricultural})` : ''}` },
          ]}
          value={isAgricultural ? 'on' : 'off'}
          onChange={(key) => router.setParams({ agri: key === 'on' ? '1' : '' })}
        />
        )}
        <ClientChipRow
          options={[
            { key: 'all', label: 'All vintages' },
            { key: 'recent', label: 'Recent' },
            { key: 'legacy', label: 'Legacy' },
          ]}
          value={vintage}
          onChange={(key) => {
            setLegacyQueue('needs_verification');
            router.setParams({ vintage: key === 'all' ? '' : key });
          }}
        />
        {isOpsLegacy ? (
          <ClientChipRow
            options={[
              { key: 'needs_verification', label: 'Needs verification' },
              { key: 'sent_to_accountant', label: 'Sent to accountant' },
              { key: 'archive', label: 'Archive' },
            ]}
            value={legacyQueue}
            onChange={(key) => setLegacyQueue(normalizeOpsLegacyQueue(key))}
          />
        ) : null}
        {isArchive ? (
          <ClientChipRow
            options={LOAN_ARCHIVE_PAGE_SIZE_OPTIONS.map((size) => ({
              key: String(size),
              label: `${size} / page`,
            }))}
            value={String(pageSize)}
            onChange={(key) => setPageSize(normalizeLoanArchivePageSize(key))}
          />
        ) : null}
        {isOpsLegacy && !isArchive ? (
          <ClientChipRow
            options={[
              { key: 'all', label: 'All balances' },
              { key: 'with', label: 'Has balance' },
              { key: 'without', label: 'Zero balance' },
            ]}
            value={hasBalance === true ? 'with' : hasBalance === false ? 'without' : 'all'}
            onChange={(key) =>
              setHasBalance(key === 'with' ? true : key === 'without' ? false : undefined)
            }
          />
        ) : null}
        <ClientChipRow
          options={[
            { key: 'all', label: 'All' },
            { key: 'pending_disbursement', label: 'Awaiting disbursement' },
            { key: 'arrears', label: 'In arrears' },
          ]}
          value={queue}
          onChange={(key) => setQueue(normalizeQueue(key))}
        />
      </View>
      {empty ? (
        <ClientEmptyState
          icon="account-balance"
          title="No loans in this book"
          message={
            creditBook
              ? `No ${vintageLabel ? `${vintageLabel} ` : ''}${creditBookLabel(creditBook)} loans match this isolated book yet.`
              : 'Clients assigned to you will appear here once they have active loans.'
          }
        />
      ) : null}
    </>
  );

  if (empty) {
    return (
      <View style={styles.container}>
        {body}
      </View>
    );
  }

  const loadMore = () => {
    const next = nextLoanListPage(page, pages);
    if (next == null || loadingMore) return;
    void fetchStaffAssignedLoans({ ...listOpts, page: next, append: true });
  };

  return (
    <View style={styles.container}>
      {body}
      <LastSyncedHint syncedAt={lastSyncedAt} />
      <FlatList
        data={visibleLoans}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        onEndReached={queue === 'all' ? loadMore : undefined}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={CoFiColors.primary} style={styles.footer} /> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={CoFiColors.primary}
          />
        }
        ListEmptyComponent={
          <ClientEmptyState
            icon="account-balance"
            title="Nothing in this queue"
            message="Clear the filter to see this isolated book."
            actionLabel="Show all"
            onAction={() => setQueue('all')}
          />
        }
        renderItem={({ item }) => {
          const completed = isLegacyAccountantCompleted(item);
          const useLegacyTone = vintage === 'legacy' || isAccountant || isOperationsStaffRole(backendRole);
          const tone = useLegacyTone
            ? accountantLegacyCardTone(item)
            : completed
              ? 'completed'
              : item.days_in_arrears > 0
                ? 'waiting'
                : 'default';
          const needsInvestment = canViewInvestment && loanNeedsCeoFundMapping(item);
          const fundHint = canViewInvestment
            ? needsInvestment
              ? 'Needs investment'
              : ceoFundDisplayName(item)
            : null;
          return (
            <HorizontalLoanCard
              title={item.client_name || item.loan_account_number}
              subtitle={[item.loan_account_number, item.product_name].filter(Boolean).join(' · ')}
              meta={[
                item.next_due_date ? `Due ${item.next_due_date}` : 'No upcoming due date',
                item.days_in_arrears > 0 ? `${item.days_in_arrears}d arrears` : null,
                fundHint,
              ]
                .filter(Boolean)
                .join(' · ')}
              amountCents={item.outstanding_principal}
              tone={tone}
              onPress={() => router.push(`/(staff)/loans/${item.id}`)}
              footer={
                <>
                  <CreditBookBadges row={item} isolatedBook={creditBook} />
                  {canAssignInvestment && needsInvestment ? (
                    <Pressable
                      style={styles.assignChip}
                      onPress={() => setAssignLoanId(item.id)}
                    >
                      <ThemedText style={styles.assignChipText}>Assign investment</ThemedText>
                    </Pressable>
                  ) : null}
                </>
              }
              badge={
                completed ? (
                  <View style={styles.completedBadge}>
                    <MaterialIcons name="check-circle" size={14} color="#047857" />
                    <ThemedText style={styles.completedText}>Completed</ThemedText>
                  </View>
                ) : (
                  <StatusBadge status={item.status} type="loan" />
                )
              }
            />
          );
        }}
      />
      {canAssignInvestment ? (
        <InvestmentAssignmentModal
          target={
            assignLoanId != null
              ? {
                  loanId: assignLoanId,
                  accountNumber: assignLoan?.loan_account_number ?? String(assignLoanId),
                  clientName: assignLoan?.client_name ?? '',
                  allocationId: assignLoan?.allocation_id,
                }
              : null
          }
          open={assignLoanId != null}
          onClose={() => setAssignLoanId(null)}
          onAssigned={(result) => {
            updateLoan(result.loan_id, {
              allocation_id: result.allocation_id,
              funding_fund_name: result.funding_fund_name ?? result.fundingFundName ?? null,
              investment_assigned: result.investment_assigned ?? true,
            });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  queueBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  list: { padding: 16, paddingBottom: 40, gap: 8 },
  footer: { marginVertical: 16 },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  completedText: { fontSize: 11, color: '#047857', fontWeight: '700' },
  assignChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: CoFiColors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  assignChipText: { color: CoFiColors.primary, fontSize: 12, fontWeight: '700' },
});
