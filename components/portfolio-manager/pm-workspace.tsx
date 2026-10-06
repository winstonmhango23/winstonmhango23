import { useCallback, useEffect, useState } from 'react';
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
import { RepaymentParHealthPanel } from '@/components/staff/repayment-par-health-panel';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  apiGetPortfolioManagerDashboard,
  apiGetPortfolioManagerQueue,
  type ApiPortfolioManagerDashboard,
  type RoleQueueApplication,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';
import type { RepaymentParHealthSnapshot } from '@/lib/staff/repayment-par-health';
import { staffApplicationWorkspaceHref } from '@/lib/staff/role-queues';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';
import { useNotificationsStore } from '@/store/notifications';

export function PortfolioManagerWorkspace({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const ensureStaffBootstrap = useHomeBootstrapStore((s) => s.ensureStaffBootstrap);
  const [dashboard, setDashboard] = useState<ApiPortfolioManagerDashboard | null>(null);
  const [queue, setQueue] = useState<RoleQueueApplication[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);

  const loadWorkspace = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const [dash, pmQueue] = await Promise.all([
        apiGetPortfolioManagerDashboard(auth.token),
        apiGetPortfolioManagerQueue(auth.token, { limit: 8 }),
      ]);
      if (dash) setDashboard(dash);
      setQueue(pmQueue.items);
      setQueueTotal(pmQueue.total);
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    void ensureStaffBootstrap();
    void loadWorkspace();
  }, [ensureStaffBootstrap, loadWorkspace]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'Manager';
  const outstanding =
    (dashboard?.total_outstanding_principal_minor ?? 0) +
    (dashboard?.total_outstanding_interest_minor ?? 0);
  const pmCount = dashboard?.with_portfolio_manager_review_count ?? queueTotal;
  const cioCount = dashboard?.with_cio_initial_review_count ?? 0;
  const pendingDisb = dashboard?.pending_disbursement_count ?? 0;
  const handoff = dashboard?.repayment_handoff_pending_count ?? 0;
  const attention =
    pmCount > 0 ? `${pmCount} awaiting you` : pendingDisb > 0 ? `${pendingDisb} to fund` : 'All clear';

  return (
    <StaffScreen
      scroll
      onRefresh={loadWorkspace}
      header={{
        title: 'Portfolio Manager',
        subtitle: 'Credit quality, origination after CIO verification, and drawdown prep',
        showNotifications: true,
        unreadCount,
        stats: [
          { label: 'PM queue', value: String(pmCount) },
          { label: 'CIO backlog', value: String(cioCount) },
          { label: 'Pending disb.', value: String(pendingDisb) },
        ],
      }}
    >
      <ClientHeroCard
        greeting={`Welcome back, ${firstName}`}
        outstandingLabel="Outstanding book"
        outstandingAmount={formatMinorMWK(outstanding)}
        nextDueLabel="Attention needed"
        nextDueDate={attention}
        nextDueHint={`${dashboard?.active_loan_count ?? 0} active · CEO ${dashboard?.with_ceo_review_count ?? 0} · GCEO ${dashboard?.with_gceo_review_count ?? 0}`}
        loanCount={dashboard?.active_loan_count ?? 0}
        inArrears={0}
      />

      <ClientSectionTitle
        title="Portfolio at Risk"
        actionLabel="Full workspace"
        onAction={() => router.push('/(staff)/par' as Href)}
      />
      <RepaymentParHealthPanel
        snapshot={dashboard?.repayment_par_health as RepaymentParHealthSnapshot | null | undefined}
        compact
        onOpenCollections={() => router.push('/(staff)/collections' as Href)}
      />

      <ClientSectionTitle title="Loan books" />
      <ClientActionGrid>
        <ClientActionTile
          icon="work"
          label="SME Loans"
          hint="Business-book products"
          onPress={() => router.push('/(staff)/loans?book=SME' as Href)}
        />
        <ClientActionTile
          icon="eco"
          label="Group Loans"
          hint="Village, cooperative, and group products"
          onPress={() => router.push('/(staff)/loans?book=GROUP' as Href)}
        />
        <ClientActionTile
          icon="account-balance"
          label="All loans"
          hint="Branch-wide loan book"
          onPress={() => router.push('/(staff)/loans' as Href)}
        />
      </ClientActionGrid>

      <ClientSectionTitle title="Escalation & drawdowns" />
      <ClientActionGrid>
        <ClientActionTile
          icon="assignment-turned-in"
          label="Approvals"
          hint={`${pmCount} CIO-verified files awaiting your decision`}
          variant="accent"
          onPress={() => router.push('/(staff)/portfolio-manager/approvals' as Href)}
        />
        <ClientActionTile
          icon="layers"
          label="Loan drawdowns"
          hint="Create draft, set tranches, confirm payee"
          onPress={() => router.push('/(staff)/portfolio-manager/drawdowns' as Href)}
        />
        <ClientActionTile
          icon="rate-review"
          label="CIO backlog"
          hint={`${cioCount} still with credit officers`}
          onPress={() => router.push('/(staff)/portfolio-manager/cio-backlog' as Href)}
        />
        <ClientActionTile
          icon="apartment"
          label="Executive pipeline"
          hint={`CEO ${dashboard?.with_ceo_review_count ?? 0} · GCEO ${dashboard?.with_gceo_review_count ?? 0}`}
          onPress={() => router.push('/(staff)/portfolio-manager/executive' as Href)}
        />
        <ClientActionTile
          icon="handshake"
          label="Repayment handoff"
          hint={handoff > 0 ? `${handoff} awaiting operations manager` : 'OPS_PENDING_MANAGER queue'}
          variant={handoff > 0 ? 'accent' : undefined}
          onPress={() => router.push('/(staff)/portfolio-manager/handoff' as Href)}
        />
        <ClientActionTile
          icon="payments"
          label="Disbursed loans"
          hint="Funded applications and outcomes"
          onPress={() => router.push('/(staff)/loans?queue=all' as Href)}
        />
      </ClientActionGrid>

      <ClientSectionTitle title="Servicing" />
      <ClientActionGrid>
        <ClientActionTile
          icon="receipt"
          label="Portfolio ledger"
          hint="Receipts, collection rate, and CIO coverage"
          variant="accent"
          onPress={() => router.push('/(staff)/portfolio-manager/repayments' as Href)}
        />
        <ClientActionTile
          icon="payment"
          label="Upcoming repayments"
          hint="Schedules and expected dues"
          onPress={() => router.push('/(staff)/repayments?tab=upcoming' as Href)}
        />
        <ClientActionTile
          icon="show-chart"
          label="PAR"
          hint="Portfolio at risk and trends"
          onPress={() => router.push('/(staff)/par' as Href)}
        />
        <ClientActionTile
          icon="gavel"
          label="Collections"
          hint="Arrears and GL trace"
          onPress={() => router.push('/(staff)/collections' as Href)}
        />
        <ClientActionTile
          icon="map"
          label="Zones & districts"
          hint="Allocate LOs across zones, including transfers"
          variant="accent"
          onPress={() => router.push('/(staff)/portfolio-manager/zones' as Href)}
        />
        <ClientActionTile
          icon="public"
          label="District coverage"
          hint="Region → zone → district portfolio view"
          onPress={() => router.push('/(staff)/portfolio-manager/district-coverage' as Href)}
        />
        <ClientActionTile
          icon="people"
          label="Clients"
          hint="Branch team book"
          onPress={() => router.push('/(staff)/clients' as Href)}
        />
        <ClientActionTile
          icon="folder-shared"
          label="CIO reports"
          hint="Structured CIO to PM submissions"
          onPress={() => router.push('/(staff)/staff-reports' as Href)}
        />
        <ClientActionTile
          icon="assessment"
          label="Reports"
          hint="Portfolio analytics"
          onPress={() => router.push('/(staff)/reports' as Href)}
        />
        <AiStudioActionTile />
      </ClientActionGrid>

      <ClientSectionTitle
        title="PM action queue"
        actionLabel={queueTotal > 0 ? 'See all' : undefined}
        onAction={
          queueTotal > 0 ? () => router.push('/(staff)/portfolio-manager/approvals' as Href) : undefined
        }
      />
      {queue.length === 0 ? (
        <ThemedText style={styles.empty}>No applications in the PM queue.</ThemedText>
      ) : (
        <View style={styles.queueList}>
          {queue.map((app) => (
            <Pressable
              key={app.id}
              style={styles.queueRow}
              onPress={() => router.push(staffApplicationWorkspaceHref(app.id))}
            >
              <View style={{ flex: 1 }}>
                <ThemedText type="defaultSemiBold">
                  {app.client_name?.trim() || app.application_number || `Application #${app.id}`}
                </ThemedText>
                <ThemedText style={styles.meta}>
                  {(app.status || '').replace(/_/g, ' ')}
                  {app.origination_stage ? ` · ${app.origination_stage.replace(/_/g, ' ')}` : ''}
                </ThemedText>
              </View>
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
    </StaffScreen>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 13,
    color: ClientUI.colors.textMuted,
    marginBottom: 12,
  },
  queueList: { gap: 8, marginBottom: 8 },
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
  meta: {
    fontSize: 12,
    color: ClientUI.colors.textMuted,
    marginTop: 2,
    fontFamily: Fonts.sans,
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
