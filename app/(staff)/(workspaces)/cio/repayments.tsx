import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { RoleActionList, type RoleActionItem } from '@/components/staff/role-action-list';
import { RepaymentKpiStrip } from '@/components/staff/repayments/repayment-kpi-strip';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiGetCioLoanOfficers,
  apiGetDueToday,
  apiGetOverdue,
  apiGetPortfolioHistory,
  apiGetUpcoming,
  type ApiCioLoanOfficer,
  type ApiRepayment,
  type ApiRepaymentOverviewItem,
} from '@/lib/data/api';
import { isCreditOfficerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { overviewToKpis, repaymentStatusLabel } from '@/lib/staff/repayment-flows';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

export default function CioRepaymentsScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isCreditOfficerStaffRole(backendRole) || backendRoleMatches(backendRole, ['CIO', 'ADMIN']);
  const [rows, setRows] = useState<ApiRepayment[]>([]);
  const [officers, setOfficers] = useState<ApiCioLoanOfficer[]>([]);
  const [due, setDue] = useState<ApiRepaymentOverviewItem[]>([]);
  const [overdue, setOverdue] = useState<ApiRepaymentOverviewItem[]>([]);
  const [upcoming, setUpcoming] = useState<ApiRepaymentOverviewItem[]>([]);
  const [officerId, setOfficerId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const [history, officerList, dueToday, overdueList, upcomingList] = await Promise.all([
        apiGetPortfolioHistory(auth.token, {
          limit: 80,
          search: debounced || undefined,
          officer_id: officerId ?? undefined,
        }),
        apiGetCioLoanOfficers(auth.token),
        apiGetDueToday(auth.token, { limit: 200 }),
        apiGetOverdue(auth.token, { limit: 200 }),
        apiGetUpcoming(auth.token, { limit: 200 }),
      ]);
      setRows(history);
      setOfficers(officerList);
      setDue(dueToday);
      setOverdue(overdueList);
      setUpcoming(upcomingList);
    } finally {
      setLoading(false);
    }
  }, [debounced, officerId]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const items = useMemo<RoleActionItem[]>(
    () =>
      rows.map((row) => ({
        id: String(row.id),
        title: row.client_name?.trim() || row.loan_account_number || `Receipt #${row.id}`,
        subtitle: [row.loan_account_number, repaymentStatusLabel(row.status || row.lifecycle_state)]
          .filter(Boolean)
          .join(' · '),
        meta: [row.repayment_date, row.reference_number || row.payment_method].filter(Boolean).join(' · '),
        amountMinor: row.total_amount ?? row.amount,
        loanId: row.loan_id,
      })),
    [rows]
  );

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Supervised ledger"
        message={desktopOnlyWorkspaceMessage('CIO shell')}
      />
    );
  }

  return (
    <RoleActionList
      title="Supervised repayments"
      subtitle={`${items.length} receipt${items.length === 1 ? '' : 's'} on your book`}
      emptyTitle="No supervised receipts"
      emptyMessage="Collections recorded by you or your loan officers will appear here."
      items={items}
      loading={loading}
      onRefresh={load}
      openLabel="Open loan"
      header={
        <>
          <RepaymentKpiStrip items={overviewToKpis({ due, overdue, upcoming })} />
          <View style={styles.filterBar}>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search loan #, client, or reference"
              placeholderTextColor={CoFiColors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {officers.length > 0 ? (
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, officerId == null && styles.chipActive]}
                onPress={() => setOfficerId(null)}
              >
                <ThemedText style={[styles.chipText, officerId == null && styles.chipTextActive]}>
                  All officers
                </ThemedText>
              </Pressable>
              {officers.map((officer) => {
                const active = officerId === officer.id;
                return (
                  <Pressable
                    key={officer.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setOfficerId(officer.id)}
                  >
                    <ThemedText style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                      {officer.full_name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  filterBar: {
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
    fontSize: 14,
    color: CoFiColors.foreground,
    paddingVertical: 2,
  },
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
    maxWidth: 180,
  },
  chipActive: {
    backgroundColor: CoFiColors.primary,
    borderColor: CoFiColors.primary,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: CoFiColors.foreground },
  chipTextActive: { color: '#fff' },
});
