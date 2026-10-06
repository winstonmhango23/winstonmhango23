import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { RoleActionList, type RoleActionItem } from '@/components/staff/role-action-list';
import { RepaymentKpiStrip } from '@/components/staff/repayments/repayment-kpi-strip';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiGetPortfolioManagerRepaymentMetrics,
  apiGetPortfolioManagerRepaymentsList,
  type ApiPmRepaymentRow,
  type ApiRepaymentMetrics,
} from '@/lib/data/api';
import { isPortfolioManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { metricsToKpis, repaymentStatusLabel } from '@/lib/staff/repayment-flows';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

type StatusFilter = 'ALL' | 'CONFIRMED' | 'PENDING';

export default function PortfolioManagerRepaymentsScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isPortfolioManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['PORTFOLIO_MANAGER', 'ADMIN']);
  const [rows, setRows] = useState<ApiPmRepaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<ApiRepaymentMetrics | null>(null);
  const [status, setStatus] = useState<StatusFilter>('ALL');
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
      const [page, kpi] = await Promise.all([
        apiGetPortfolioManagerRepaymentsList(auth.token, {
          limit: 80,
          search: debounced || undefined,
          status: status === 'ALL' ? undefined : status,
        }),
        apiGetPortfolioManagerRepaymentMetrics(auth.token),
      ]);
      setRows(page.items);
      setTotal(page.total);
      setMetrics(kpi);
    } finally {
      setLoading(false);
    }
  }, [debounced, status]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const items = useMemo<RoleActionItem[]>(
    () =>
      rows.map((row) => ({
        id: String(row.id),
        title: row.client_name?.trim() || row.loan_number || `Receipt #${row.id}`,
        subtitle: [row.loan_number, repaymentStatusLabel(row.internal_status), row.payment_method]
          .filter(Boolean)
          .join(' · '),
        meta: [row.repayment_date ? String(row.repayment_date).slice(0, 10) : null, row.cio_officer_name]
          .filter(Boolean)
          .join(' · '),
        amountMinor: row.total_amount,
        loanId: row.loan_id,
      })),
    [rows]
  );

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Portfolio repayments"
        message={desktopOnlyWorkspaceMessage('Portfolio Manager shell')}
      />
    );
  }

  return (
    <RoleActionList
      title="Portfolio repayments"
      subtitle={`${total || items.length} receipt${(total || items.length) === 1 ? '' : 's'} across the branch book`}
      emptyTitle="No portfolio receipts"
      emptyMessage="Recorded collections across CIO books will appear here."
      items={items}
      loading={loading}
      onRefresh={load}
      openLabel="Open loan"
      header={
        <>
          <RepaymentKpiStrip items={metricsToKpis(metrics)} />
          <View style={styles.filterBar}>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search client, loan, or officer"
              placeholderTextColor={CoFiColors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.chipRow}>
            {(['ALL', 'CONFIRMED', 'PENDING'] as const).map((key) => {
              const active = status === key;
              return (
                <Pressable
                  key={key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setStatus(key)}
                >
                  <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                    {key === 'ALL' ? 'All statuses' : key === 'CONFIRMED' ? 'Posted' : 'Pending'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
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
  },
  chipActive: {
    backgroundColor: CoFiColors.primary,
    borderColor: CoFiColors.primary,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: CoFiColors.foreground },
  chipTextActive: { color: '#fff' },
});
