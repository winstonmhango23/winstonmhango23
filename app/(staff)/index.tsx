import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  StaffScreen,
  ClientActionGrid,
  ClientActionTile,
  ClientHeroCard,
  ClientSectionTitle,
} from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  apiGetDigest,
  apiGetLoanOfficerDashboard,
  type ApiLoanOfficerDashboard,
  type ApiStaffDigest,
} from '@/lib/data/api';
import { AiStudioActionTile } from '@/components/staff/ai-studio-action-tile';
import { AccountantWorkspace } from '@/components/accountant/accountant-workspace';
import { AuditorWorkspace } from '@/components/auditor/auditor-workspace';
import { CioWorkspace } from '@/components/cio/cio-workspace';
import { CeoWorkspace, GceoWorkspace } from '@/components/leadership/executive-workspace';
import { OperationsAssistantWorkspace } from '@/components/operations/operations-assistant-workspace';
import { OperationsManagerWorkspace } from '@/components/operations/operations-manager-workspace';
import { OperationsOfficerWorkspace } from '@/components/operations/operations-officer-workspace';
import { PortfolioManagerWorkspace } from '@/components/portfolio-manager/pm-workspace';
import {
  isAccountantStaffRole,
  isInternalAuditorStaffRole,
  isCeoStaffRole,
  isCreditOfficerStaffRole,
  isGceoStaffRole,
  isLoanOfficerStaffRole,
  isOperationsAssistantStaffRole,
  isOperationsManagerStaffRole,
  isOperationsOfficerStaffRole,
  isPortfolioManagerStaffRole,
  staffBookOfficerTitle,
} from '@/lib/loan-origination/origination-workflow';
import { RepaymentParHealthPanel } from '@/components/staff/repayment-par-health-panel';
import {
  formatParPct,
  loDashboardQueueItems,
  loPar30Pct,
  loParHealth,
} from '@/lib/staff/loan-officer-dashboard';
import { staffHasAiStudio } from '@/lib/staff/ai-studio-access';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';
import {
  useApplicationsStore,
  useLoansStore,
  useNotificationsStore,
  useClientsStore,
} from '@/store';
import { useCollectionsStore } from '@/store/collections';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';

export default function StaffDigestScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const ensureStaffBootstrap = useHomeBootstrapStore((s) => s.ensureStaffBootstrap);
  const staffReady = useHomeBootstrapStore((s) => s.staff.ready);
  const { applications } = useApplicationsStore();
  const { loans } = useLoansStore();
  const { unreadCount } = useNotificationsStore();
  const { clients } = useClientsStore();
  const { fetchStats, delinquentLoans, fetchDelinquentLoans } = useCollectionsStore();
  const [digest, setDigest] = useState<ApiStaffDigest | null>(null);
  const [loDashboard, setLoDashboard] = useState<ApiLoanOfficerDashboard | null>(null);

  const jobRole = user?.backendRole ?? user?.role;
  const isLoanOfficer = isLoanOfficerStaffRole(jobRole);
  const isCreditOfficer = isCreditOfficerStaffRole(jobRole);
  const isPortfolioManager = isPortfolioManagerStaffRole(jobRole);
  const isAccountant = isAccountantStaffRole(jobRole);
  const isInternalAuditor = isInternalAuditorStaffRole(jobRole);
  const isGceo = isGceoStaffRole(jobRole);
  const isCeo = isCeoStaffRole(jobRole);
  const isOpsManager = isOperationsManagerStaffRole(jobRole);
  const isOpsAssistant = isOperationsAssistantStaffRole(jobRole);
  const isOpsOfficer = isOperationsOfficerStaffRole(jobRole);

  const loadDigest = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const payload = await apiGetDigest(auth.token);
      setDigest(payload);
    } catch {
      // keep local KPI fallback
    }
  }, []);

  const loadLoDashboard = useCallback(async () => {
    if (!isLoanOfficer) {
      setLoDashboard(null);
      return;
    }
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      setLoDashboard(await apiGetLoanOfficerDashboard(auth.token));
    } catch {
      setLoDashboard(null);
    }
  }, [isLoanOfficer]);

  useEffect(() => {
    void ensureStaffBootstrap();
    void loadDigest();
    void loadLoDashboard();
  }, [ensureStaffBootstrap, loadDigest, loadLoDashboard]);

  const summary = useMemo(() => {
    const activeLoans = loans.filter((l) => l.status === 'ACTIVE' || l.status === 'DISBURSED');
    const overdueLoans = loans.filter((l) => {
      if (l.status === 'OVERDUE' || l.status === 'DEFAULTED') return true;
      if ((l.days_in_arrears ?? 0) > 0) return true;
      return false;
    });
    const pendingApps = applications.filter(
      (a) => a.status === 'DRAFT' || a.status === 'PENDING' || a.status === 'SUBMITTED'
    );
    const localOutstanding = activeLoans.reduce((s, l) => s + (l.outstanding_principal ?? 0), 0);
    const dueTodayCount = digest?.summary?.due_today_count ?? digest?.due_today?.length;
    const overdueCount = digest?.summary?.overdue_count ?? digest?.overdue?.length;

    return {
      activeLoans,
      overdueLoans,
      pendingApps,
      totalOutstanding: loDashboard?.portfolio_value ?? localOutstanding,
      activeLoanCount: loDashboard?.total_active_loans ?? activeLoans.length,
      pendingAppCount: loDashboard?.total_pending_applications ?? pendingApps.length,
      arrearsCount: loDashboard?.total_arrears_loans ?? overdueLoans.length,
      activeClients: loDashboard?.active_clients ?? clients.length,
      dueTodayCount: typeof dueTodayCount === 'number' ? dueTodayCount : null,
      overdueCount:
        typeof loDashboard?.overdue_repayments === 'number'
          ? loDashboard.overdue_repayments
          : typeof overdueCount === 'number'
            ? overdueCount
            : overdueLoans.length,
      overdueTotalMinor: digest?.summary?.overdue_total_mwk ?? null,
      par30: formatParPct(loPar30Pct(loDashboard)),
      parHealth: loParHealth(loDashboard),
      queues: loDashboard ? loDashboardQueueItems(loDashboard).filter((q) => q.count > 0) : [],
      recentApps: loDashboard?.recent_applications?.slice(0, 5) ?? [],
      upcoming: loDashboard?.upcoming_repayments?.slice(0, 5) ?? [],
    };
  }, [loans, applications, digest, loDashboard, clients.length]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'Officer';
  const bootstrapping = !staffReady;

  if (isCreditOfficer) {
    return (
      <View style={styles.root}>
        <CioWorkspace />
        <HomeBootstrapOverlay visible={bootstrapping} label="Loading your CIO workspace…" />
      </View>
    );
  }
  if (isPortfolioManager) {
    return (
      <View style={styles.root}>
        <PortfolioManagerWorkspace />
        <HomeBootstrapOverlay visible={bootstrapping} label="Loading your PM workspace…" />
      </View>
    );
  }
  if (isAccountant) {
    return (
      <View style={styles.root}>
        <AccountantWorkspace />
        <HomeBootstrapOverlay visible={bootstrapping} label="Loading your accountant workspace…" />
      </View>
    );
  }
  if (isInternalAuditor) {
    return (
      <View style={styles.root}>
        <AuditorWorkspace />
        <HomeBootstrapOverlay visible={bootstrapping} label="Loading your auditor workspace…" />
      </View>
    );
  }
  if (isGceo) {
    return (
      <View style={styles.root}>
        <GceoWorkspace />
        <HomeBootstrapOverlay visible={bootstrapping} label="Loading your GCEO workspace…" />
      </View>
    );
  }
  if (isCeo) {
    return (
      <View style={styles.root}>
        <CeoWorkspace />
        <HomeBootstrapOverlay visible={bootstrapping} label="Loading your CEO workspace…" />
      </View>
    );
  }
  if (isOpsManager) {
    return (
      <View style={styles.root}>
        <OperationsManagerWorkspace />
        <HomeBootstrapOverlay visible={bootstrapping} label="Loading your operations manager workspace…" />
      </View>
    );
  }
  if (isOpsAssistant) {
    return (
      <View style={styles.root}>
        <OperationsAssistantWorkspace />
        <HomeBootstrapOverlay visible={bootstrapping} label="Loading your operations assistant workspace…" />
      </View>
    );
  }
  if (isOpsOfficer) {
    return (
      <View style={styles.root}>
        <OperationsOfficerWorkspace />
        <HomeBootstrapOverlay visible={bootstrapping} label="Loading your operations officer workspace…" />
      </View>
    );
  }
  const attentionCount =
    summary.overdueCount > 0
      ? summary.overdueCount
      : delinquentLoans.length > 0
        ? delinquentLoans.length
        : 0;

  const onRefresh = async () => {
    await Promise.all([
      useApplicationsStore.getState().fetchApplications(),
      useLoansStore.getState().fetchLoans(),
      useNotificationsStore.getState().fetchNotifications(),
      useClientsStore.getState().fetchClients(),
      fetchStats(),
      fetchDelinquentLoans(),
      loadDigest(),
      loadLoDashboard(),
      useAuthStore.getState().fetchPermissions(),
    ]);
  };

  return (
    <View style={styles.root}>
      <StaffScreen
        scroll
        refreshing={false}
        onRefresh={onRefresh}
        header={{
          title: isLoanOfficer
            ? staffBookOfficerTitle(
                'lo',
                loDashboard?.credit_book || user?.creditBook
              )
            : 'Staff Digest',
          subtitle: isLoanOfficer
            ? `${loDashboard?.credit_book_label || staffBookOfficerTitle('lo', user?.creditBook)} portfolio workspace`
            : digest?.digest_date
              ? `Daily digest · ${digest.digest_date}`
              : 'Portfolio overview & quick actions',
          showNotifications: true,
          unreadCount,
          stats: [
            {
              label: 'Due today',
              value: String(summary.dueTodayCount ?? '—'),
            },
            { label: 'Overdue', value: String(summary.overdueCount) },
            { label: 'Pending apps', value: String(summary.pendingAppCount) },
          ],
        }}
      >
        <ClientHeroCard
          greeting={`Welcome back, ${firstName}`}
          outstandingLabel={isLoanOfficer ? 'Your outstanding book' : 'Portfolio outstanding'}
          outstandingAmount={formatMinorMWK(summary.totalOutstanding)}
          nextDueLabel="Attention needed"
          nextDueDate={
            attentionCount > 0
              ? `${attentionCount} overdue`
              : summary.dueTodayCount && summary.dueTodayCount > 0
                ? `${summary.dueTodayCount} due today`
                : 'All clear'
          }
          nextDueHint={
            isLoanOfficer
              ? `${summary.activeClients} clients · PAR 30 ${summary.par30}`
              : summary.pendingAppCount > 0
                ? `${summary.pendingAppCount} applications awaiting review`
                : summary.dueTodayCount != null
                  ? `${summary.dueTodayCount} due today · ${summary.overdueCount} overdue`
                  : undefined
          }
          loanCount={summary.activeLoanCount}
          inArrears={summary.arrearsCount}
        />

        {isLoanOfficer ? (
          <>
            <ClientSectionTitle
              title="Portfolio at Risk"
              actionLabel="Full workspace"
              onAction={() => router.push('/(staff)/par' as Href)}
            />
            <RepaymentParHealthPanel
              snapshot={summary.parHealth}
              compact
              onOpenCollections={() => router.push('/(staff)/collections' as Href)}
            />
          </>
        ) : null}

        {isLoanOfficer && summary.queues.length > 0 ? (
          <>
            <ClientSectionTitle title="Your queues" />
            <View style={styles.queueList}>
              {summary.queues.map((q) => (
                <Pressable
                  key={q.key}
                  style={styles.queueRow}
                  onPress={() => router.push(q.href as Href)}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.queueLabel}>{q.label}</ThemedText>
                  </View>
                  <View style={styles.queueBadge}>
                    <ThemedText style={styles.queueBadgeText}>{q.count}</ThemedText>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {isLoanOfficer && summary.recentApps.length > 0 ? (
          <>
            <ClientSectionTitle
              title="Recent applications"
              actionLabel="See all"
              onAction={() => router.push('/(staff)/applications')}
            />
            <View style={styles.queueList}>
              {summary.recentApps.map((app) => (
                <Pressable
                  key={app.application_id}
                  style={styles.queueRow}
                  onPress={() =>
                    router.push(`/(staff)/applications/${app.application_id}` as Href)
                  }
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold">{app.client_name}</ThemedText>
                    <ThemedText style={styles.meta}>
                      {app.status} · {formatMinorMWK(app.amount)}
                    </ThemedText>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {isLoanOfficer && summary.upcoming.length > 0 ? (
          <>
            <ClientSectionTitle
              title="Upcoming repayments"
              actionLabel="Repayments"
              onAction={() => router.push('/(staff)/repayments?tab=upcoming' as Href)}
            />
            <View style={styles.queueList}>
              {summary.upcoming.map((row) => (
                <Pressable
                  key={`${row.loan_id}-${row.due_date ?? ''}`}
                  style={styles.queueRow}
                  onPress={() => router.push(`/(staff)/loans/${row.loan_id}` as Href)}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold">{row.client_name}</ThemedText>
                    <ThemedText style={styles.meta}>
                      {(row.due_date || '').slice(0, 10) || 'No due date'}
                      {row.amount_due != null ? ` · ${formatMinorMWK(row.amount_due)}` : ''}
                    </ThemedText>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <ClientSectionTitle title="Workspace" />
        <ClientActionGrid>
          <ClientActionTile
            icon="description"
            label="Applications"
            hint={`${summary.pendingAppCount} pending review`}
            variant="accent"
            onPress={() => router.push('/(staff)/applications')}
          />
          {staffHasAiStudio(jobRole) ? <AiStudioActionTile /> : null}
          <ClientActionTile
            icon="account-balance"
            label="My loans"
            hint={`${summary.activeLoanCount} active`}
            onPress={() => router.push('/(staff)/loans')}
          />
          <ClientActionTile
            icon="people"
            label="Clients"
            hint={`${summary.activeClients} ${isLoanOfficer ? 'in your book' : 'assigned'}`}
            onPress={() => router.push('/(staff)/clients')}
          />
          <ClientActionTile
            icon="gavel"
            label="Collections"
            hint={`${delinquentLoans.length} delinquent`}
            onPress={() => router.push('/(staff)/collections' as Href)}
          />
          <ClientActionTile
            icon="payment"
            label="Repayments"
            hint="Record & track payments"
            onPress={() => router.push('/(staff)/repayments?tab=due' as Href)}
          />
          <ClientActionTile
            icon="account-balance-wallet"
            label="Savings"
            hint="Deposit & withdraw"
            onPress={() => router.push('/(staff)/savings' as Href)}
          />
          <ClientActionTile
            icon="map"
            label="Properties map"
            hint="Collateral locations · Malawi"
            variant="accent"
            onPress={() => router.push('/(staff)/properties-map' as Href)}
          />
          {isLoanOfficer ? (
            <ClientActionTile
              icon="show-chart"
              label="PAR workspace"
              hint={`PAR 30 ${summary.par30} · engine buckets`}
              variant="accent"
              onPress={() => router.push('/(staff)/par' as Href)}
            />
          ) : null}
          <ClientActionTile
            icon="assignment"
            label="CRB reports"
            hint={
              isLoanOfficer
                ? 'Your book: clients and loans'
                : 'Supervised officers, clients and loans'
            }
            variant="accent"
            onPress={() => router.push('/(staff)/crb' as Href)}
          />
          <ClientActionTile
            icon="assessment"
            label="Reports"
            hint={isLoanOfficer ? `PAR 30 ${summary.par30}` : 'Portfolio analytics'}
            onPress={() => router.push('/(staff)/reports' as Href)}
          />
          <ClientActionTile
            icon="folder-shared"
            label="Staff reporting"
            hint="Generate, forward & inbox across roles"
            variant="accent"
            onPress={() => router.push('/(staff)/staff-reports' as Href)}
          />
          <ClientActionTile
            icon="notifications"
            label="Notifications"
            hint={unreadCount > 0 ? `${unreadCount} unread` : 'No new alerts'}
            onPress={() => router.push('/(staff)/notifications')}
          />
          <ClientActionTile
            icon="tune"
            label="Digest settings"
            hint="Daily digest delivery"
            onPress={() => router.push('/(staff)/notification-settings' as Href)}
          />
        </ClientActionGrid>

        <Pressable
          style={styles.switchBtn}
          onPress={async () => {
            const { signOutToLogin } = await import('@/lib/auth-sign-out');
            await signOutToLogin(router);
          }}
        >
          <MaterialIcons name="swap-horiz" size={20} color={ClientUI.colors.primary} />
          <ThemedText style={styles.switchText}>Sign in with a different account</ThemedText>
        </Pressable>
      </StaffScreen>

      <HomeBootstrapOverlay
        visible={bootstrapping}
        label="Loading your workspace…"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  queueList: {
    gap: 8,
    marginBottom: 8,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  queueLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: ClientUI.colors.text,
  },
  queueBadge: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: ClientUI.colors.primary,
    alignItems: 'center',
  },
  queueBadgeText: {
    color: '#fff',
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
  },
  meta: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 2,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 36,
    paddingVertical: 14,
  },
  switchText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.primary,
  },
});
