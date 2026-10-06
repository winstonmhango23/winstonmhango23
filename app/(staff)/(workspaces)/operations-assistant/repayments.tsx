import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RoleActionList, type RoleActionItem } from '@/components/staff/role-action-list';
import { LoanScheduleModal } from '@/components/staff/repayments/loan-schedule-modal';
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
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { LegacyPreviousRepaymentModal } from '@/components/staff/repayments/legacy-previous-repayment-modal';
import { StaffRepaymentModal } from '@/components/staff-repayment-modal';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { isOperationsAssistantStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

type Desk = 'current' | 'legacy';

export default function OperationsAssistantRepaymentsScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsAssistantStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_ASSISTANT', 'ADMIN']);
  const [desk, setDesk] = useState<Desk>('current');
  const { search, setSearch, debounced } = useDebouncedSearch();
  const book = useLegacyRepaymentBook(debounced);
  const current = useCurrentRepaymentLoans(debounced);
  const startTrackingAction = useStartLegacyTrackingAction(book.load);
  const recordLegacy = useRecordRepaymentAction(book.rows);
  const recordCurrent = useRecordRepaymentAction(current.rows);
  const recordPrevious = useRecordPreviousRepaymentsAction(book.rows);
  const recordRepayment = desk === 'current' ? recordCurrent : recordLegacy;
  const [scheduleItem, setScheduleItem] = useState<RoleActionItem | null>(null);
  const showingCurrent = desk === 'current';

  const refreshCurrent = current.load;
  const refreshBook = book.load;
  const refresh = useCallback(async () => {
    await Promise.all([refreshCurrent(), refreshBook()]);
  }, [refreshCurrent, refreshBook]);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Ops repayments"
        message={desktopOnlyWorkspaceMessage('Operations Assistant shell')}
      />
    );
  }

  return (
    <>
      <RoleActionList
        title={showingCurrent ? 'Current loans' : 'Legacy repayment book'}
        subtitle={
          showingCurrent
            ? 'Originated loans that are overdue, due today, or upcoming. Search, then record a repayment from any row.'
            : 'Outstanding SME and Group legacy loans with schedules. Agricultural is a subcategory. Overdue and due today sit first.'
        }
        emptyTitle={showingCurrent ? current.emptyTitle : book.emptyTitle}
        emptyMessage={showingCurrent ? current.emptyMessage : book.emptyMessage}
        items={showingCurrent ? current.items : book.items}
        loading={showingCurrent ? current.loading : book.loading}
        onRefresh={refresh}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Loan number or client name"
        openLabel="View schedule"
        onOpen={(item) => setScheduleItem(item)}
        actions={[
          recordRepayment.action,
          showingCurrent ? null : recordPrevious.action,
          showingCurrent ? null : startTrackingAction,
        ].filter((action): action is NonNullable<typeof action> => action != null)}
        header={
          <>
            <View style={styles.chipRow}>
              {(
                [
                  ['current', 'Current loans'],
                  ['legacy', 'Legacy book'],
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
        visible={!showingCurrent && recordPrevious.loan != null}
        loan={recordPrevious.loan}
        onClose={recordPrevious.close}
        onRecorded={() => {
          recordPrevious.close();
          void refresh();
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
