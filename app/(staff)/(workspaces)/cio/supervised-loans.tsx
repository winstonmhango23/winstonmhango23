import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { ClientChipRow } from '@/components/client-ui/client-chip-row';
import { ClientEmptyState } from '@/components/client-ui/client-empty-state';
import { HorizontalLoanCard } from '@/components/staff/horizontal-loan-card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatusBadge } from '@/components/ui/list-card';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { staffScreenContainer } from '@/constants/staff-navigation';
import {
  apiGetCioLoanOfficers,
  apiGetCioSupervisedLoansV2,
  type ApiCioLoanOfficer,
  type ApiCioSupervisedLoansV2,
  type ApiSupervisedLoan,
} from '@/lib/data/api';
import { isCreditOfficerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

const PAGE_SIZE = 25;

type CacheMode = 'live' | 'cache';

export default function CioSupervisedLoansScreen() {
  const router = useRouter();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isCreditOfficerStaffRole(backendRole) || backendRoleMatches(backendRole, ['CIO', 'ADMIN']);
  const [data, setData] = useState<ApiCioSupervisedLoansV2 | null>(null);
  const [officers, setOfficers] = useState<ApiCioLoanOfficer[]>([]);
  const [officerId, setOfficerId] = useState<number | null>(null);
  const [bookedOnly, setBookedOnly] = useState(false);
  const [cacheMode, setCacheMode] = useState<CacheMode>('cache');
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchSeq = useRef(0);

  const load = useCallback(
    async (opts: { skip?: number; append?: boolean } = {}) => {
      const mySeq = ++fetchSeq.current;
      const nextSkip = opts.skip ?? 0;
      try {
        const auth = await getStoredAuth();
        if (!auth?.token) return;
        const res = await apiGetCioSupervisedLoansV2(auth.token, {
          skip: nextSkip,
          limit: PAGE_SIZE,
          loan_officer_id: officerId ?? undefined,
          disbursed_booked_only: bookedOnly,
          use_cache: cacheMode === 'cache',
        });
        if (mySeq !== fetchSeq.current) return;
        setData((prev) =>
          opts.append && prev
            ? { ...res, loans: [...prev.loans, ...res.loans] }
            : res
        );
        setSkip(nextSkip + res.loans.length);
      } finally {
        if (mySeq === fetchSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [bookedOnly, cacheMode, officerId]
  );

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void (async () => {
      try {
        const auth = await getStoredAuth();
        if (!auth?.token) return;
        const officerList = await apiGetCioLoanOfficers(auth.token);
        if (!cancelled) setOfficers(officerList);
      } catch {
        /* officer filter is additive */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ skip: 0 });
    setRefreshing(false);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!data || loadingMore || skip >= data.total) return;
    setLoadingMore(true);
    void load({ skip, append: true });
  }, [data, loadingMore, load, skip]);

  const loans = data?.loans ?? [];
  const aggregations = data?.aggregations;
  const stats = useMemo(() => {
    if (!aggregations) return [];
    return [
      { label: 'Active', value: String(aggregations.total_active_loans), icon: 'check-circle' as const },
      { label: 'Pending', value: String(aggregations.total_pending_loans), icon: 'schedule' as const },
      { label: 'Arrears', value: String(aggregations.total_arrears_loans), icon: 'warning' as const },
    ];
  }, [aggregations]);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Supervised loans"
        message={desktopOnlyWorkspaceMessage('CIO shell')}
      />
    );
  }

  const body = (
    <>
      <ScreenHeader
        title="Supervised loans"
        subtitle={`${data?.total ?? 0} loans across your supervised book · officer, booked and cache controls`}
        icon="account-balance"
        stats={stats}
      />
      <View style={styles.controls}>
        <ClientChipRow
          options={[
            { key: 'cache', label: 'Cached' },
            { key: 'live', label: 'Live' },
          ]}
          value={cacheMode}
          onChange={(key) => setCacheMode(key)}
        />
        <ClientChipRow
          options={[
            { key: 'all', label: 'All loans' },
            { key: 'booked', label: 'Disbursed / booked only' },
          ]}
          value={bookedOnly ? 'booked' : 'all'}
          onChange={(key) => setBookedOnly(key === 'booked')}
        />
        {officers.length > 0 ? (
          <ClientChipRow
            options={[
              { key: 'all', label: 'All officers' },
              ...officers.map((o) => ({ key: String(o.id), label: o.full_name } as const)),
            ]}
            value={officerId == null ? 'all' : String(officerId)}
            onChange={(key) => setOfficerId(key === 'all' ? null : Number(key))}
          />
        ) : null}
      </View>
      {loading && loans.length === 0 ? (
        <ActivityIndicator color={CoFiColors.primary} style={styles.loading} />
      ) : null}
    </>
  );

  if (loading && loans.length === 0) {
    return (
      <View style={styles.container}>
        {body}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {body}
      <FlatList
        data={loans}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
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
          !loading ? (
            <ClientEmptyState
              icon="account-balance"
              title="No supervised loans"
              message="Loans booked by you or your supervised loan officers will appear here."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <SupervisedLoanRow loan={item} onPress={() => router.push(`/(staff)/loans/${item.id}`)} />
        )}
      />
    </View>
  );
}

function SupervisedLoanRow({
  loan,
  onPress,
}: {
  loan: ApiSupervisedLoan;
  onPress: () => void;
}) {
  const inArrears = (loan.arrears_days ?? 0) > 0;
  return (
    <HorizontalLoanCard
      title={loan.client_name || loan.loan_id}
      subtitle={[loan.loan_id, loan.product_name, loan.loan_officer_name].filter(Boolean).join(' · ')}
      meta={[
        loan.next_due_date ? `Due ${loan.next_due_date}` : 'No upcoming due date',
        inArrears ? `${loan.arrears_days}d arrears` : null,
        loan.disbursement_date ? `Disbursed ${loan.disbursement_date}` : 'Not disbursed',
      ]
        .filter(Boolean)
        .join(' · ')}
      amountCents={loan.outstanding_balance}
      tone={inArrears ? 'waiting' : 'default'}
      onPress={onPress}
      badge={<StatusBadge status={loan.status} type="loan" />}
      footer={
        <ThemedText style={styles.rowFooter}>
          {loan.repayment_tracking_live ? 'Repayment tracking live' : 'Awaiting ops handoff'}{' '}
          · {formatMinorMWK(loan.amount)} approved
        </ThemedText>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: staffScreenContainer,
  controls: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  loading: { marginVertical: 32 },
  list: { padding: 16, paddingBottom: 40, gap: 8 },
  footer: { marginVertical: 16 },
  rowFooter: { fontSize: 11, color: CoFiColors.mutedForeground },
});