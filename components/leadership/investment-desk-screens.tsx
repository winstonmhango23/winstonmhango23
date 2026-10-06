import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { RoleActionList, type RoleActionItem } from '@/components/staff/role-action-list';
import {
  ClientActionGrid,
  ClientActionTile,
  ClientChipRow,
  ClientSectionTitle,
  DesktopOnlyWorkspace,
  StaffScreen,
} from '@/components/staff-ui';
import {
  apiGetInvestmentAllocationSummary,
  apiGetInvestmentAllocations,
  apiGetInvestmentFundStats,
  apiGetInvestmentFunds,
  apiGetInvestmentShareholderStats,
  apiGetInvestmentShareholders,
  apiGetInvestmentSubscriptionStats,
  apiGetInvestmentSubscriptions,
  apiPostApproveInvestmentSubscription,
  apiPostRejectInvestmentSubscription,
  type ApiFundStatistics,
  type ApiInvestmentAllocation,
  type ApiInvestmentAllocationSummary,
  type ApiInvestmentFund,
  type ApiShareholder,
  type ApiShareholderInvestment,
  type ApiShareholderInvestmentStatistics,
  type ApiShareholderStatistics,
} from '@/lib/data/api';
import {
  allocationToActionItem,
  canAccessInvestmentDesk,
  fundToActionItem,
  investmentOverviewKpis,
  isPendingSubscription,
  shareholderToActionItem,
  subscriptionToActionItem,
} from '@/lib/staff/investment-desk';
import { desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';
import { useNotificationsStore } from '@/store/notifications';

function useInvestmentAllowed(): boolean {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  return canAccessInvestmentDesk(backendRole);
}

function InvestmentGate({ title }: { title: string }) {
  return (
    <DesktopOnlyWorkspace
      title={title}
      message={desktopOnlyWorkspaceMessage('CEO / GCEO investment shell')}
    />
  );
}

export function InvestmentOverviewScreen() {
  const router = useRouter();
  const allowed = useInvestmentAllowed();
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const [funds, setFunds] = useState<ApiFundStatistics | null>(null);
  const [shareholders, setShareholders] = useState<ApiShareholderStatistics | null>(null);
  const [subscriptions, setSubscriptions] = useState<ApiShareholderInvestmentStatistics | null>(null);
  const [allocations, setAllocations] = useState<ApiInvestmentAllocationSummary | null>(null);

  const load = useCallback(async () => {
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    const [fundStats, shareholderStats, subscriptionStats, allocationSummary] = await Promise.all([
      apiGetInvestmentFundStats(auth.token),
      apiGetInvestmentShareholderStats(auth.token),
      apiGetInvestmentSubscriptionStats(auth.token),
      apiGetInvestmentAllocationSummary(auth.token),
    ]);
    setFunds(fundStats);
    setShareholders(shareholderStats);
    setSubscriptions(subscriptionStats);
    setAllocations(allocationSummary);
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const kpis = investmentOverviewKpis({ funds, shareholders, subscriptions, allocations });

  if (!allowed) return <InvestmentGate title="Investment Overview" />;

  return (
    <StaffScreen
      scroll
      onRefresh={load}
      header={{
        title: 'Investment Overview',
        subtitle: 'Funds, shareholders, subscriptions, and capital allocation',
        showNotifications: true,
        unreadCount,
        stats: kpis.slice(0, 3).map((kpi) => ({ label: kpi.label, value: kpi.value })),
      }}
    >
      <ClientSectionTitle title="Capital desk" />
      <ClientActionGrid>
        <ClientActionTile
          icon="account-balance-wallet"
          label="Investment Funds"
          hint={`${funds?.active_funds ?? 0} active · ${funds?.raising_funds ?? 0} raising`}
          variant="accent"
          onPress={() => router.push('/(staff)/investments/funds' as Href)}
        />
        <ClientActionTile
          icon="supervisor-account"
          label="Shareholders"
          hint={`${shareholders?.total_shareholders ?? 0} investors on the register`}
          onPress={() => router.push('/(staff)/investments/shareholders' as Href)}
        />
        <ClientActionTile
          icon="attach-money"
          label="Investments"
          hint={`${subscriptions?.total_investments ?? 0} subscriptions · approve pending`}
          onPress={() => router.push('/(staff)/investments/subscriptions' as Href)}
        />
        <ClientActionTile
          icon="pie-chart"
          label="Capital allocation"
          hint={`${allocations?.active_allocation_count ?? 0} active pools`}
          onPress={() => router.push('/(staff)/investments/allocations' as Href)}
        />
      </ClientActionGrid>
      <ClientSectionTitle title="Capacity" />
      <ClientActionGrid>
        {kpis.slice(3).map((kpi) => (
          <ClientActionTile
            key={kpi.label}
            icon="insights"
            label={kpi.label}
            hint={kpi.value}
            onPress={() => router.push('/(staff)/investments/allocations' as Href)}
          />
        ))}
      </ClientActionGrid>
    </StaffScreen>
  );
}

function useInvestmentList<T>(loader: (token: string) => Promise<T[]>, allowed: boolean) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      setRows(await loader(auth.token));
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  return { rows, loading, load };
}

export function InvestmentFundsScreen() {
  const allowed = useInvestmentAllowed();
  const loader = useCallback(
    (token: string) => apiGetInvestmentFunds(token, { limit: 100 }),
    []
  );
  const { rows, loading, load } = useInvestmentList<ApiInvestmentFund>(loader, allowed);
  if (!allowed) return <InvestmentGate title="Investment Funds" />;
  return (
    <RoleActionList
      title="Investment Funds"
      subtitle="Committed and paid-in capital by fund"
      emptyTitle="No funds"
      emptyMessage="No investment funds are registered for this bank."
      items={rows.map(fundToActionItem)}
      loading={loading}
      onRefresh={load}
    />
  );
}

export function InvestmentShareholdersScreen() {
  const allowed = useInvestmentAllowed();
  const loader = useCallback(
    (token: string) => apiGetInvestmentShareholders(token, { limit: 100 }),
    []
  );
  const { rows, loading, load } = useInvestmentList<ApiShareholder>(loader, allowed);
  if (!allowed) return <InvestmentGate title="Shareholders" />;
  return (
    <RoleActionList
      title="Shareholders"
      subtitle="Investor register and commitment totals"
      emptyTitle="No shareholders"
      emptyMessage="No shareholders are on the investment register."
      items={rows.map(shareholderToActionItem)}
      loading={loading}
      onRefresh={load}
    />
  );
}

export function InvestmentSubscriptionsScreen() {
  const allowed = useInvestmentAllowed();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const loader = useCallback(
    (token: string) => apiGetInvestmentSubscriptions(token, { limit: 100 }),
    []
  );
  const { rows, loading, load } = useInvestmentList<ApiShareholderInvestment>(loader, allowed);

  const visible = useMemo(
    () =>
      filter === 'pending'
        ? rows.filter((row) => isPendingSubscription(row.approval_status))
        : rows,
    [filter, rows]
  );

  const decide = useCallback(
    async (item: RoleActionItem, next: 'approve' | 'reject') => {
      const row = rows.find((entry) => String(entry.id) === item.id);
      if (!row || !isPendingSubscription(row.approval_status)) return;
      try {
        const auth = await getStoredAuth();
        if (!auth?.token) return;
        if (next === 'approve') {
          await apiPostApproveInvestmentSubscription(auth.token, row.id);
        } else {
          await apiPostRejectInvestmentSubscription(auth.token, row.id);
        }
        await load();
      } catch (error) {
        Alert.alert(
          'Subscription update failed',
          error instanceof Error ? error.message : 'Try again from the investment desk.'
        );
      }
    },
    [load, rows]
  );

  if (!allowed) return <InvestmentGate title="Investments" />;

  return (
    <RoleActionList
      title="Investments"
      subtitle="Shareholder subscriptions. Pending rows can be approved or rejected."
      emptyTitle={filter === 'pending' ? 'No pending subscriptions' : 'No investments'}
      emptyMessage={
        filter === 'pending'
          ? 'No investor subscriptions are waiting for CEO or GCEO approval.'
          : 'No shareholder subscriptions are recorded.'
      }
      items={visible.map(subscriptionToActionItem)}
      loading={loading}
      onRefresh={load}
      header={
        <ClientChipRow
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'pending', label: 'Pending' },
            { key: 'all', label: 'All' },
          ]}
        />
      }
      actions={
        filter === 'pending'
          ? [
              { label: 'Approve', kind: 'primary', onPress: (item) => void decide(item, 'approve') },
              { label: 'Reject', kind: 'danger', onPress: (item) => void decide(item, 'reject') },
            ]
          : []
      }
    />
  );
}

export function InvestmentAllocationsScreen() {
  const allowed = useInvestmentAllowed();
  const loader = useCallback(
    (token: string) => apiGetInvestmentAllocations(token, { limit: 100 }),
    []
  );
  const { rows, loading, load } = useInvestmentList<ApiInvestmentAllocation>(loader, allowed);
  if (!allowed) return <InvestmentGate title="Capital allocation" />;
  return (
    <RoleActionList
      title="Capital allocation"
      subtitle="Fund pools allocated to services and branches"
      emptyTitle="No allocations"
      emptyMessage="No capital allocations have been set for this bank."
      items={rows.map(allocationToActionItem)}
      loading={loading}
      onRefresh={load}
    />
  );
}
