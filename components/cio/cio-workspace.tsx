import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import {
  ClientActionGrid,
  ClientActionTile,
  ClientHeroCard,
  ClientSectionTitle,
  StaffScreen,
} from '@/components/staff-ui';
import { AiStudioActionTile } from '@/components/staff/ai-studio-action-tile';
import { LastSyncedHint } from '@/components/ui/last-synced-hint';
import { ThemedText } from '@/components/themed-text';
import { CioLegacyAssignmentModal } from '@/components/cio/cio-legacy-assignment-modal';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  apiGetCioDashboard,
  apiGetCioSupervisedPortfolioAnalytics,
  apiGetCreditBookCounts,
  type ApiCioDashboard,
  type ApiCioSupervisedPortfolioAnalytics,
  type ApiCreditBookCounts,
} from '@/lib/data/api';
import {
  creditBookLabel,
  isSmeCreditBook,
  staffBookOfficerTitle,
} from '@/lib/loan-origination/origination-workflow';
import {
  readCioDashboardCache,
  staffListFetchOpts,
  writeCioDashboardCache,
} from '@/lib/staff/cio-offline';
import { getStoredAuth } from '@/lib/storage';
import { getPendingSyncCount } from '@/lib/sync/sync-service';
import { useAuthStore } from '@/store/auth';
import { useApplicationsStore, useClientsStore, useLoansStore } from '@/store';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';
import { useNotificationsStore } from '@/store/notifications';

export function CioWorkspace({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const lastSyncedAt = useLoansStore((s) => s.lastSyncedAt);
  const loans = useLoansStore((s) => s.loans);
  const applications = useApplicationsStore((s) => s.applications);
  const clients = useClientsStore((s) => s.clients);
  const ensureStaffBootstrap = useHomeBootstrapStore((s) => s.ensureStaffBootstrap);
  const [dashboard, setDashboard] = useState<ApiCioDashboard | null>(null);
  const [bookCounts, setBookCounts] = useState<ApiCreditBookCounts | null>(null);
  const [analytics, setAnalytics] = useState<ApiCioSupervisedPortfolioAnalytics | null>(null);
  const [usingCache, setUsingCache] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [assignmentOpen, setAssignmentOpen] = useState(false);

  const listOpts = staffListFetchOpts(user);

  const loadDashboard = useCallback(async () => {
    const cached = await readCioDashboardCache();
    if (cached) {
      setDashboard(cached);
      setUsingCache(true);
    }
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const live = await apiGetCioDashboard(auth.token);
      if (live) {
        setDashboard(live);
        setUsingCache(false);
        await writeCioDashboardCache(live);
      }
      try {
        const counts = await apiGetCreditBookCounts(auth.token, { supervised_only: true });
        setBookCounts(counts);
        const an = await apiGetCioSupervisedPortfolioAnalytics(auth.token);
        if (an) setAnalytics(an);
      } catch {
        /* analytics are additive — a failure should not blank the dashboard */
      }
    } catch {
      if (!cached) setDashboard(null);
    }
  }, []);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([
      loadDashboard(),
      useApplicationsStore.getState().fetchApplications({
        supervisedOnly: listOpts.supervisedOnly,
        creditBook: listOpts.creditBook,
      }),
      useLoansStore.getState().fetchLoans({ creditBook: listOpts.creditBook }),
      useClientsStore.getState().fetchClients(),
      useNotificationsStore.getState().fetchNotifications(),
      getPendingSyncCount().then(setPendingSync).catch(() => setPendingSync(0)),
    ]);
  }, [listOpts.creditBook, listOpts.supervisedOnly, loadDashboard]);

  useEffect(() => {
    void ensureStaffBootstrap();
    void loadDashboard();
    void getPendingSyncCount().then(setPendingSync).catch(() => setPendingSync(0));
  }, [ensureStaffBootstrap, loadDashboard]);

  const local = useMemo(() => {
    const activeLoans = loans.filter((l) => {
      const status = String(l.status || '').toUpperCase();
      return status === 'ACTIVE' || status === 'DISBURSED';
    });
    const arrears = loans.filter((l) => (l.days_in_arrears ?? 0) > 0);
    const pendingApps = applications.filter((a) => {
      const status = String(a.status || '').toUpperCase();
      return (
        status === 'DRAFT' ||
        status === 'PENDING' ||
        status === 'SUBMITTED' ||
        status === 'PENDING_REVIEW' ||
        status === 'UNDER_REVIEW'
      );
    });
    return {
      activeLoanCount: activeLoans.length,
      arrearsCount: arrears.length,
      pendingAppCount: pendingApps.length,
      outstanding: activeLoans.reduce((sum, loan) => sum + (loan.outstanding_principal ?? 0), 0),
      clientCount: clients.length,
    };
  }, [applications, clients.length, loans]);

  const book = dashboard?.credit_book || user?.creditBook;
  const sme = isSmeCreditBook(book) || Boolean(dashboard?.self_originating);
  const bookName = dashboard?.credit_book_label || creditBookLabel(book);
  const firstName = user?.fullName?.split(' ')[0] ?? 'Officer';
  const officers = dashboard?.officer_stats ?? [];
  const activeLoanCount = dashboard?.total_active_loans ?? local.activeLoanCount;
  const pendingCount = dashboard?.total_pending_loans ?? local.pendingAppCount;
  const arrearsCount = dashboard?.total_arrears_loans ?? local.arrearsCount;
  const outstanding = dashboard?.total_portfolio_value ?? local.outstanding;

  return (
    <StaffScreen
      scroll
      onRefresh={refreshWorkspace}
      header={{
        title: staffBookOfficerTitle('cio', sme ? 'SME' : book),
        subtitle: sme
          ? 'Originate SME loans and submit them to the portfolio manager. Loan officers can be added later.'
          : 'Supervise loan officers on the Group book. Group CIOs review LO files rather than self-originate.',
        showNotifications: true,
        unreadCount,
        stats: [
          { label: 'Active loans', value: String(activeLoanCount) },
          { label: 'Pending', value: String(pendingCount) },
          { label: 'Arrears', value: String(arrearsCount) },
        ],
      }}
    >
      <LastSyncedHint syncedAt={lastSyncedAt} />
      {usingCache ? (
        <ThemedText style={styles.offlineHint}>
          Showing the last synced CIO book. Offline create, KYC, origination, and repayments will
          queue like a loan officer device.
        </ThemedText>
      ) : null}

      <ClientHeroCard
        greeting={`Welcome back, ${firstName}`}
        outstandingLabel={`${bookName} outstanding book`}
        outstandingAmount={formatMinorMWK(outstanding)}
        nextDueLabel="Credit book"
        nextDueDate={bookName}
        nextDueHint={
          sme
            ? `${local.clientCount} zone clients · originate and submit to PM`
            : `${local.clientCount} zone clients · review LO files, then verify to PM`
        }
        loanCount={activeLoanCount}
        inArrears={arrearsCount}
      />

      <ClientSectionTitle title="Loan books" />
      <ClientActionGrid>
        <ClientActionTile
          icon="work"
          label="SME Loans"
          hint={
            bookCounts
              ? `${bookCounts.sme} loans · women SME, individual SME, and business products`
              : 'Women SME, individual SME, and business products'
          }
          variant={sme ? 'accent' : undefined}
          onPress={() => router.push('/(staff)/loans?book=SME' as Href)}
        />
        <ClientActionTile
          icon="eco"
          label="Group Loans"
          hint={
            bookCounts
              ? `${bookCounts.group} loans · village, cooperative, and group products`
              : 'Village, cooperative, and group products'
          }
          variant={!sme ? 'accent' : undefined}
          onPress={() => router.push('/(staff)/loans?book=GROUP' as Href)}
        />
      </ClientActionGrid>

      {analytics ? (
        <>
          <ClientSectionTitle title="Supervised portfolio analytics" />
          <View style={styles.analyticsRow}>
            {[
              { label: 'Total', value: analytics.portfolio_rollups.total_loans },
              { label: 'Active', value: analytics.portfolio_rollups.active_loans },
              { label: 'Delinquent', value: analytics.portfolio_rollups.delinquent_loans },
              { label: 'Default', value: analytics.portfolio_rollups.default_loans },
            ].map((stat) => (
              <View key={stat.label} style={styles.analyticsCell}>
                <ThemedText style={styles.analyticsValue}>{stat.value}</ThemedText>
                <ThemedText style={styles.analyticsLabel}>{stat.label}</ThemedText>
              </View>
            ))}
          </View>
          <View style={styles.analyticsStrip}>
            <ThemedText style={styles.analyticsStripText}>
              {formatMinorMWK(analytics.portfolio_rollups.total_outstanding_principal_minor)} outstanding ·{' '}
              {formatMinorMWK(analytics.portfolio_rollups.total_repaid_minor)} repaid
            </ThemedText>
          </View>
        </>
      ) : null}

      <ClientSectionTitle title="CIO workspace" />
      <ClientActionGrid>
        {sme ? (
        <ClientActionTile
          icon="post-add"
          label="Originate"
          hint="Create an SME application"
          variant="accent"
          onPress={() => router.push('/(staff)/applications' as Href)}
        />
        ) : null}
        <ClientActionTile
          icon="assignment"
          label="Origination pipeline"
          hint={`${pendingCount} awaiting review`}
          onPress={() => router.push('/(staff)/applications?queue=review' as Href)}
        />
        <ClientActionTile
          icon="people"
          label="Zone clients"
          hint={sme ? 'SME zone book' : 'Assign unassigned clients to LOs'}
          onPress={() => router.push('/(staff)/clients' as Href)}
        />
        <ClientActionTile
          icon="account-balance"
          label="Supervised loans"
          hint={`${activeLoanCount} active · officer filter, booked-only and cache controls`}
          onPress={() => router.push('/(staff)/cio/supervised-loans' as Href)}
        />
        <ClientActionTile
          icon="payment"
          label="Supervised repayments"
          hint="Ledger, officer filter, and due KPIs"
          variant="accent"
          onPress={() => router.push('/(staff)/cio/repayments' as Href)}
        />
        <ClientActionTile
          icon="event"
          label="Collections hub"
          hint="Due, overdue, and recorded receipts"
          onPress={() => router.push('/(staff)/repayments?tab=due' as Href)}
        />
        <ClientActionTile
          icon="show-chart"
          label="PAR"
          hint="Supervised portfolio at risk"
          onPress={() => router.push('/(staff)/par' as Href)}
        />
        <ClientActionTile
          icon="fact-check"
          label="CRB reports"
          hint="Acknowledge or return LO reports"
          onPress={() => router.push('/(staff)/crb' as Href)}
        />
        <ClientActionTile
          icon="sync"
          label="Sync"
          hint={pendingSync > 0 ? `${pendingSync} waiting to upload` : 'Offline queue and retries'}
          variant={pendingSync > 0 ? 'accent' : undefined}
          onPress={() => router.push('/(staff)/sync' as Href)}
        />
        <ClientActionTile
          icon="folder-shared"
          label="Staff reporting"
          hint="Forward and review officer reports"
          onPress={() => router.push('/(staff)/staff-reports' as Href)}
        />
        <AiStudioActionTile />
        <ClientActionTile
          icon="pending-actions"
          label="Legacy follow-up"
          hint="Assign legacy loans to loan officers"
          onPress={() => setAssignmentOpen(true)}
        />
      </ClientActionGrid>

      <ClientSectionTitle
        title={sme ? 'Your book' : 'Supervised loan officers'}
        actionLabel={officers.length > 0 ? `${officers.length}` : undefined}
      />
      {officers.length === 0 ? (
        <ThemedText style={styles.emptyOfficers}>
          {sme
            ? 'No loan officers yet. Originate SME loans yourself and submit them to the portfolio manager.'
            : 'No loan officers are assigned to you yet. Group CIOs supervise LOs rather than self-originate.'}
        </ThemedText>
      ) : (
        <View style={styles.officerList}>
          {officers.map((officer) => (
            <Pressable
              key={officer.officer_id}
              style={styles.officerRow}
              onPress={() => router.push('/(staff)/applications?queue=review' as Href)}
            >
              <View style={{ flex: 1 }}>
                <ThemedText type="defaultSemiBold">{officer.officer_name}</ThemedText>
                <ThemedText style={styles.meta}>
                  {officer.active_loans} active · {officer.pending_loans} pending ·{' '}
                  {officer.arrears_loans} arrears
                </ThemedText>
              </View>
              <ThemedText style={styles.value}>{formatMinorMWK(officer.portfolio_value)}</ThemedText>
              <MaterialIcons name="chevron-right" size={20} color={ClientUI.colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      {!embedded ? (
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
      ) : null}

      <CioLegacyAssignmentModal
        open={assignmentOpen}
        onClose={() => setAssignmentOpen(false)}
        onChanged={() => void refreshWorkspace()}
      />
    </StaffScreen>
  );
}

const styles = StyleSheet.create({
  offlineHint: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginHorizontal: 4,
    marginBottom: 10,
  },
  analyticsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  analyticsCell: {
    flex: 1,
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  analyticsValue: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    color: ClientUI.colors.text,
  },
  analyticsLabel: {
    fontSize: 11,
    color: ClientUI.colors.textMuted,
    marginTop: 2,
  },
  analyticsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ClientUI.colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  analyticsStripText: {
    fontSize: 12,
    color: ClientUI.colors.text,
  },
  emptyOfficers: {
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    marginBottom: 12,
  },
  officerList: { gap: 8, marginBottom: 8 },
  officerRow: {
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
  meta: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 2,
  },
  value: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: ClientUI.colors.text,
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
