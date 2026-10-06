import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import type { RoleAction, RoleActionItem } from '@/components/staff/role-action-list';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiGetLegacyRepaymentBook,
  apiPostStartLegacyRepaymentTracking,
  type ApiRepaymentOverviewItem,
} from '@/lib/data/api';
import { isOperationsStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { canCollectRepayments } from '@/lib/repayment-role-workspace';
import {
  currentRepaymentBucketCounts,
  legacyBookToActionItems,
  legacyCreditBookLabel,
  normalizeLegacyCreditBook,
  overviewToStaffLoan,
  selectCurrentRepaymentBucket,
  type CurrentRepaymentBucket,
  type LegacyCreditBook,
} from '@/lib/staff/legacy-repayment-book';
import { getStoredAuth } from '@/lib/storage';
import type { Loan } from '@/store';
import { useAuthStore } from '@/store/auth';
import { useRepaymentsStore } from '@/store/repayments';

export function useDebouncedSearch(delay = 350) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), delay);
    return () => clearTimeout(timer);
  }, [delay, search]);

  return { search, setSearch, debounced };
}

export function useLegacyRepaymentBook(search?: string) {
  const [book, setBook] = useState<LegacyCreditBook>('SME');
  const [sme, setSme] = useState<ApiRepaymentOverviewItem[]>([]);
  const [group, setGroup] = useState<ApiRepaymentOverviewItem[]>([]);
  const [agri, setAgri] = useState<ApiRepaymentOverviewItem[]>([]);
  const [totals, setTotals] = useState<{ sme?: number; group?: number; agricultural?: number }>({});
  const [loading, setLoading] = useState(true);
  const query = search?.trim() || undefined;

  const load = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [smePage, groupPage, agriPage] = await Promise.all([
        apiGetLegacyRepaymentBook(auth.token, { creditBook: 'SME', limit: 200, search: query }),
        apiGetLegacyRepaymentBook(auth.token, { creditBook: 'GROUP', limit: 200, search: query }),
        apiGetLegacyRepaymentBook(auth.token, { creditBook: 'AGRICULTURAL', limit: 200, search: query }),
      ]);
      setSme(smePage.data ?? []);
      setGroup(groupPage.data ?? []);
      setAgri(agriPage.data ?? []);
      setTotals({
        sme: smePage.book_totals?.sme ?? smePage.total ?? smePage.data?.length ?? 0,
        group: groupPage.book_totals?.group ?? groupPage.total ?? groupPage.data?.length ?? 0,
        agricultural:
          agriPage.book_totals?.agricultural ?? agriPage.total ?? agriPage.data?.length ?? 0,
      });
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = book === 'SME' ? sme : book === 'GROUP' ? group : agri;
  const items = useMemo(() => legacyBookToActionItems(rows), [rows]);

  return {
    book,
    setBook: (value: string) => setBook(normalizeLegacyCreditBook(value)),
    items,
    rows,
    totals,
    loading,
    load,
    emptyTitle: `No ${legacyCreditBookLabel(book)} legacy loans`,
    emptyMessage:
      'Only outstanding legacy loans that already have a repayment schedule appear here. Journaled loans with a remaining balance stay collectible. Use Record previous repayments for historical collections.',
  };
}

export function useCurrentRepaymentLoans(search?: string) {
  const dueToday = useRepaymentsStore((s) => s.dueToday);
  const overdue = useRepaymentsStore((s) => s.overdue);
  const upcoming = useRepaymentsStore((s) => s.upcoming);
  const loading = useRepaymentsStore((s) => s.hubLoading);
  const fetchHub = useRepaymentsStore((s) => s.fetchHub);
  const [bucket, setBucket] = useState<CurrentRepaymentBucket>('all');
  const query = search?.trim() || undefined;

  const load = useCallback(async () => {
    await fetchHub({ search: query });
  }, [fetchHub, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => currentRepaymentBucketCounts(dueToday, overdue, upcoming),
    [dueToday, overdue, upcoming]
  );
  const rows = useMemo(
    () => selectCurrentRepaymentBucket(dueToday, overdue, upcoming, bucket),
    [bucket, dueToday, overdue, upcoming]
  );
  const items = useMemo(() => legacyBookToActionItems(rows), [rows]);

  return {
    bucket,
    setBucket,
    counts,
    rows,
    items,
    loading,
    load,
    emptyTitle: 'No current loans due',
    emptyMessage:
      'Due, overdue, and upcoming originated loans appear here. Record a repayment from any row.',
  };
}

/**
 * Per-loan "Record repayment" action for ops officer / assistant / manager.
 * Returns null when the role cannot book (accountant, LO, CIO).
 */
export function useRecordRepaymentAction(rows: ApiRepaymentOverviewItem[]): {
  action: RoleAction | null;
  loan: Loan | null;
  close: () => void;
} {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed = canCollectRepayments(backendRole);
  const [loan, setLoan] = useState<Loan | null>(null);

  const onPress = useCallback(
    (item: RoleActionItem) => {
      const loanId = item.loanId ?? Number(item.id);
      const row = rows.find((candidate) => candidate.id === loanId);
      if (row) setLoan(overviewToStaffLoan(row));
    },
    [rows]
  );

  if (!allowed) return { action: null, loan: null, close: () => undefined };
  return {
    action: {
      label: 'Record repayment',
      kind: 'primary',
      onPress,
    },
    loan,
    close: () => setLoan(null),
  };
}

/**
 * Separate CTA on the same legacy loan for historical collections already
 * paid before the loan was assigned to an investment fund.
 */
export function useRecordPreviousRepaymentsAction(rows: ApiRepaymentOverviewItem[]): {
  action: RoleAction | null;
  loan: Loan | null;
  close: () => void;
} {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed = canCollectRepayments(backendRole);
  const [loan, setLoan] = useState<Loan | null>(null);

  const onPress = useCallback(
    (item: RoleActionItem) => {
      const loanId = item.loanId ?? Number(item.id);
      const row = rows.find((candidate) => candidate.id === loanId);
      if (row) setLoan(overviewToStaffLoan(row));
    },
    [rows]
  );

  if (!allowed) return { action: null, loan: null, close: () => undefined };
  return {
    action: {
      label: 'Record previous repayments',
      kind: 'secondary',
      onPress,
    },
    loan,
    close: () => setLoan(null),
  };
}

/**
 * "Start tracking" action for journaled legacy loans whose ops-generated
 * schedule was never activated (schedule_tracking_pending). Activates the
 * schedule with its ORIGINAL due dates, so a late start immediately reports
 * the days already in arrears. Returns null for non-operations roles —
 * mirrors backend require_ops_legacy_booking (officer / assistant / manager).
 */
export function useStartLegacyTrackingAction(reload: () => Promise<void>): RoleAction | null {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['ADMIN', 'SUPER_ADMIN']);

  const onPress = useCallback(
    async (item: RoleActionItem) => {
      const loanId = item.loanId ?? Number(item.id);
      if (!loanId) return;
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      try {
        const result = await apiPostStartLegacyRepaymentTracking(auth.token, Number(loanId));
        Alert.alert(
          'Repayment tracking started',
          result.days_in_arrears > 0
            ? `Schedule activated — ${result.days_in_arrears} day(s) already in arrears from the operations schedule dates.`
            : `Schedule activated. Next due ${result.next_due_date?.slice(0, 10) ?? '—'}.`
        );
        await reload();
      } catch (error) {
        Alert.alert(
          'Could not start tracking',
          error instanceof Error && error.message
            ? error.message
            : 'The repayment tracking request failed.'
        );
      }
    },
    [reload]
  );

  if (!allowed) return null;
  return {
    label: 'Start tracking',
    kind: 'primary',
    visible: (item) => item.scheduleTrackingPending === true,
    onPress: (item) => void onPress(item),
  };
}

export function CurrentBookChips({
  bucket,
  counts,
  onChange,
}: {
  bucket: CurrentRepaymentBucket;
  counts: Record<CurrentRepaymentBucket, number>;
  onChange: (bucket: CurrentRepaymentBucket) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {(
        [
          ['all', 'All', counts.all],
          ['overdue', 'Overdue', counts.overdue],
          ['due_today', 'Due today', counts.due_today],
          ['upcoming', 'Upcoming', counts.upcoming],
        ] as const
      ).map(([key, label, count]) => {
        const active = bucket === key;
        return (
          <Pressable
            key={key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(key)}
          >
            <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
              {label}
              {count != null ? ` ${count}` : ''}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LegacyBookChips({
  book,
  totals,
  onChange,
}: {
  book: LegacyCreditBook;
  totals: { sme?: number; group?: number; agricultural?: number };
  onChange: (book: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {(
        [
          ['SME', 'SME', totals.sme],
          ['GROUP', 'Group', totals.group],
          ['AGRICULTURAL', 'Agricultural', totals.agricultural],
        ] as const
      ).map(([key, label, count]) => {
        const active = book === key;
        return (
          <Pressable
            key={key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(key)}
          >
            <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
              {label}
              {count != null ? ` ${count}` : ''}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
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
