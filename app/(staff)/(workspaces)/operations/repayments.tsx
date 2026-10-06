import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { RoleActionList, type RoleActionItem } from '@/components/staff/role-action-list';
import {
  CurrentBookChips,
  LegacyBookChips,
  useCurrentRepaymentLoans,
  useDebouncedSearch,
  useLegacyRepaymentBook,
  useRecordPreviousRepaymentsAction,
  useRecordRepaymentAction,
  useStartLegacyTrackingAction,
} from '@/components/staff/repayments/legacy-repayment-book';
import { LoanScheduleModal } from '@/components/staff/repayments/loan-schedule-modal';
import { StaffReasonModal } from '@/components/staff/staff-reason-modal';
import { LegacyPreviousRepaymentModal } from '@/components/staff/repayments/legacy-previous-repayment-modal';
import { StaffRepaymentModal } from '@/components/staff-repayment-modal';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiGetOperationsOfficerRecentRepayments,
  apiPostOperationsOfficerEscalateRepayment,
  type ApiEscalatedRepaymentRow,
} from '@/lib/data/api';
import { isOperationsOfficerStaffRole, isOperationsManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { opsRepaymentRecordHref } from '@/lib/ops-records';
import { repaymentAmountMinor } from '@/lib/staff/repayment-flows';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

function repaymentId(row: ApiEscalatedRepaymentRow, index: number): number {
  return row.repayment_id ?? row.id ?? index;
}

type Desk = 'current' | 'legacy' | 'receipts';

export default function OperationsRepaymentsScreen() {
  const router = useRouter();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const isOfficer = isOperationsOfficerStaffRole(backendRole);
  const allowed =
    isOfficer ||
    isOperationsManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_OFFICER', 'OPERATIONS_MANAGER', 'ADMIN']);
  const [desk, setDesk] = useState<Desk>('current');
  const [rows, setRows] = useState<ApiEscalatedRepaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<RoleActionItem | null>(null);
  const [scheduleItem, setScheduleItem] = useState<RoleActionItem | null>(null);
  const { search, setSearch, debounced } = useDebouncedSearch();
  const book = useLegacyRepaymentBook(debounced);
  const current = useCurrentRepaymentLoans(debounced);

  const loadReceipts = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const page = await apiGetOperationsOfficerRecentRepayments(auth.token, { limit: 50 });
      setRows(page.items ?? []);
      setTotal(page.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void loadReceipts();
  }, [allowed, loadReceipts]);

  const receiptItems = useMemo<RoleActionItem[]>(
    () =>
      rows.map((row, i) => ({
        id: String(repaymentId(row, i)),
        title: row.client_name?.trim() || row.receipt_number || `Receipt #${repaymentId(row, i)}`,
        subtitle: (row.manager_approval_status || row.status || 'Recorded').replace(/_/g, ' '),
        meta: row.escalation_reason || row.reason || row.reference || undefined,
        amountMinor: repaymentAmountMinor(row),
        applicationId: row.loan_application_id,
        loanId: row.loan_id,
      })),
    [rows]
  );

  const refreshBook = book.load;
  const refreshCurrent = current.load;
  const refresh = useCallback(async () => {
    await Promise.all([refreshCurrent(), refreshBook(), loadReceipts()]);
  }, [refreshCurrent, refreshBook, loadReceipts]);
  const startTrackingAction = useStartLegacyTrackingAction(refreshBook);
  const recordLegacy = useRecordRepaymentAction(book.rows);
  const recordCurrent = useRecordRepaymentAction(current.rows);
  const recordPrevious = useRecordPreviousRepaymentsAction(book.rows);
  const recordRepayment = desk === 'current' ? recordCurrent : recordLegacy;

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Ops repayments"
        message={desktopOnlyWorkspaceMessage('Operations Officer shell')}
      />
    );
  }

  const showingCurrent = desk === 'current';
  const showingBook = desk === 'legacy';
  const loanDesk = showingCurrent || showingBook;

  return (
    <>
      <RoleActionList
        title={
          showingCurrent
            ? 'Current loans'
            : showingBook
              ? 'Legacy repayment book'
              : 'Recent repayments'
        }
        subtitle={
          showingCurrent
            ? 'Originated loans that are overdue, due today, or upcoming. Search, then record a repayment from any row.'
            : showingBook
              ? 'Outstanding SME and Group legacy loans with schedules. Agricultural is a subcategory. Overdue and due today sit first.'
              : `${total} receipt${total === 1 ? '' : 's'} — open the full record, then escalate if needed`
        }
        emptyTitle={
          showingCurrent ? current.emptyTitle : showingBook ? book.emptyTitle : 'No recent receipts'
        }
        emptyMessage={
          showingCurrent
            ? current.emptyMessage
            : showingBook
              ? book.emptyMessage
              : 'Recorded repayments will appear here for operations follow-up.'
        }
        items={showingCurrent ? current.items : showingBook ? book.items : receiptItems}
        loading={showingCurrent ? current.loading : showingBook ? book.loading : loading}
        onRefresh={refresh}
        searchValue={loanDesk ? search : undefined}
        onSearchChange={loanDesk ? setSearch : undefined}
        searchPlaceholder="Loan number or client name"
        openLabel={loanDesk ? 'View schedule' : 'View record'}
        onOpen={
          loanDesk
            ? (item) => setScheduleItem(item)
            : (item) => router.push(opsRepaymentRecordHref(Number(item.id), 'officer'))
        }
        actions={
          loanDesk
            ? [
                recordRepayment.action,
                showingBook ? recordPrevious.action : null,
                showingBook ? startTrackingAction : null,
              ].filter((action): action is NonNullable<typeof action> => action != null)
            : isOfficer
              ? [{ label: 'Escalate', kind: 'danger', onPress: (item) => setTarget(item) }]
              : undefined
        }
        header={
          <>
            <View style={styles.chipRow}>
              {(
                [
                  ['current', 'Current loans'],
                  ['legacy', 'Legacy book'],
                  ['receipts', 'Receipts'],
                ] as const
              ).map(([key, label]) => {
                const active = desk === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setDesk(key)}
                  >
                    <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                      {label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            {showingCurrent ? (
              <CurrentBookChips
                bucket={current.bucket}
                counts={current.counts}
                onChange={current.setBucket}
              />
            ) : null}
            {showingBook ? (
              <LegacyBookChips book={book.book} totals={book.totals} onChange={book.setBook} />
            ) : null}
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
      <StaffRepaymentModal
        visible={recordRepayment.loan != null}
        loan={recordRepayment.loan}
        onClose={recordRepayment.close}
        onRecorded={() => {
          recordRepayment.close();
          void refresh();
        }}
      />
      <LegacyPreviousRepaymentModal
        visible={showingBook && recordPrevious.loan != null}
        loan={recordPrevious.loan}
        onClose={recordPrevious.close}
        onRecorded={() => {
          recordPrevious.close();
          void refresh();
        }}
      />
      <StaffReasonModal
        visible={target != null}
        title="Escalate repayment"
        subtitle="The operations manager will approve or reject this receipt. Reason must be at least 10 characters."
        confirmLabel="Escalate"
        minLength={10}
        onClose={() => setTarget(null)}
        onSubmit={async (reason) => {
          const auth = await getStoredAuth();
          if (!auth?.token || !target) return;
          await apiPostOperationsOfficerEscalateRepayment(auth.token, Number(target.id), reason);
          Alert.alert('Escalated', 'The operations manager will review this receipt.');
          await loadReceipts();
        }}
      />
    </>
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
});
