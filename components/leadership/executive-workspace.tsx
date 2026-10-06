import { useCallback, useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';

import {
  ClientActionGrid,
  ClientActionTile,
  ClientHeroCard,
  ClientSectionTitle,
  StaffScreen,
} from '@/components/staff-ui';
import { AiStudioActionTile } from '@/components/staff/ai-studio-action-tile';
import { RepaymentParHealthPanel } from '@/components/staff/repayment-par-health-panel';
import { LoanBookTiles, WorkspaceQueuePreview, WorkspaceSignOut } from '@/components/staff/role-workspace-preview';
import {
  apiGetCeoDashboard,
  apiGetCeoQueue,
  apiGetGceoDashboard,
  apiGetGceoQueue,
  apiGetPendingDisbursementReleases,
  type ApiPortfolioManagerDashboard,
  type RoleQueueApplication,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';
import type { RepaymentParHealthSnapshot } from '@/lib/staff/repayment-par-health';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';
import { useNotificationsStore } from '@/store/notifications';

type Audience = 'ceo' | 'gceo';

export function ExecutiveWorkspace({
  audience,
  embedded = false,
}: {
  audience: Audience;
  embedded?: boolean;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const ensureStaffBootstrap = useHomeBootstrapStore((s) => s.ensureStaffBootstrap);
  const [dashboard, setDashboard] = useState<ApiPortfolioManagerDashboard | null>(null);
  const [queue, setQueue] = useState<RoleQueueApplication[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [releaseCount, setReleaseCount] = useState(0);

  const isGceo = audience === 'gceo';
  const title = isGceo ? 'General Chief Executive' : 'Chief Executive';
  const queueHref = isGceo ? '/(staff)/gceo/queue' : '/(staff)/ceo/queue';
  const releaseHref = isGceo ? '/(staff)/gceo/pending-release' : '/(staff)/ceo/pending-release';
  const repayHref = isGceo ? '/(staff)/gceo/repayments' : '/(staff)/ceo/repayments';

  const loadWorkspace = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const [dash, actionQueue, releases] = await Promise.all([
        isGceo ? apiGetGceoDashboard(auth.token) : apiGetCeoDashboard(auth.token),
        isGceo ? apiGetGceoQueue(auth.token, { limit: 8 }) : apiGetCeoQueue(auth.token, { limit: 8 }),
        apiGetPendingDisbursementReleases(auth.token, { limit: 8 }),
      ]);
      if (dash) setDashboard(dash);
      setQueue(actionQueue.items);
      setQueueTotal(actionQueue.total);
      setReleaseCount(releases.length);
    } catch {
      /* keep last snapshot */
    }
  }, [isGceo]);

  useEffect(() => {
    void ensureStaffBootstrap();
    void loadWorkspace();
  }, [ensureStaffBootstrap, loadWorkspace]);

  const firstName = user?.fullName?.split(' ')[0] ?? (isGceo ? 'GCEO' : 'CEO');
  const ceoCount = dashboard?.with_ceo_review_count ?? (isGceo ? 0 : queueTotal);
  const gceoCount = dashboard?.with_gceo_review_count ?? (isGceo ? queueTotal : 0);
  const pendingDisb = dashboard?.pending_disbursement_count ?? 0;
  const outstanding =
    (dashboard?.total_outstanding_principal_minor ?? 0) +
    (dashboard?.total_outstanding_interest_minor ?? 0);
  const myQueue = isGceo ? gceoCount : ceoCount;
  const attention =
    myQueue > 0
      ? `${myQueue} origination files`
      : releaseCount > 0
        ? `${releaseCount} pending release`
        : 'All clear';

  return (
    <StaffScreen
      scroll
      onRefresh={loadWorkspace}
      header={{
        title,
        subtitle: isGceo
          ? 'Final-band origination, fund release, and institutional repayment oversight'
          : 'Limit-gated origination, fund release, and repayment oversight',
        showNotifications: true,
        unreadCount,
        stats: [
          { label: isGceo ? 'GCEO queue' : 'CEO queue', value: String(myQueue) },
          { label: 'Pending release', value: String(releaseCount) },
          { label: 'Pending disb.', value: String(pendingDisb) },
        ],
      }}
    >
      <ClientHeroCard
        greeting={`Welcome back, ${firstName}`}
        outstandingLabel="Institution outstanding"
        outstandingAmount={formatMinorMWK(outstanding)}
        nextDueLabel="Attention needed"
        nextDueDate={attention}
        nextDueHint={`${dashboard?.active_loan_count ?? 0} active · CEO ${ceoCount} · GCEO ${gceoCount}`}
        loanCount={dashboard?.active_loan_count ?? 0}
        inArrears={0}
      />

      <ClientSectionTitle title="Portfolio at Risk" actionLabel="PAR" onAction={() => router.push('/(staff)/par' as Href)} />
      <RepaymentParHealthPanel
        snapshot={dashboard?.repayment_par_health as RepaymentParHealthSnapshot | null | undefined}
        compact
        onOpenCollections={() => router.push('/(staff)/collections' as Href)}
      />

      <ClientSectionTitle title="Loan books" />
      <LoanBookTiles />

      <ClientSectionTitle title="Origination & release" />
      <ClientActionGrid>
        <ClientActionTile
          icon="how-to-reg"
          label={isGceo ? 'GCEO action queue' : 'CEO action queue'}
          hint={
            isGceo
              ? `${myQueue} files awaiting final approve-to-accountant`
              : `${myQueue} files to approve or escalate to GCEO`
          }
          variant="accent"
          onPress={() => router.push(queueHref as Href)}
        />
        <ClientActionTile
          icon="lock-open"
          label="Pending fund release"
          hint={`${releaseCount} dual-control disbursements after operations review`}
          variant={releaseCount > 0 ? 'accent' : undefined}
          onPress={() => router.push(releaseHref as Href)}
        />
        {!isGceo ? (
          <ClientActionTile
            icon="trending-up"
            label="GCEO escalations"
            hint={`${gceoCount} files already with the General CEO`}
            onPress={() => router.push('/(staff)/ceo/gceo-escalations' as Href)}
          />
        ) : (
          <ClientActionTile
            icon="visibility"
            label="CEO pipeline"
            hint={`${ceoCount} files still in the CEO band`}
            onPress={() => router.push('/(staff)/gceo/ceo-pipeline' as Href)}
          />
        )}
      </ClientActionGrid>

      <ClientSectionTitle title="Investment" />
      <ClientActionGrid>
        <ClientActionTile
          icon="account-balance"
          label="Investment Overview"
          hint="Funds, shareholders, subscriptions, and allocated capital"
          variant="accent"
          onPress={() => router.push('/(staff)/investments' as Href)}
        />
        <ClientActionTile
          icon="account-balance-wallet"
          label="Investment Funds"
          hint="Committed and paid-in capital by fund"
          onPress={() => router.push('/(staff)/investments/funds' as Href)}
        />
        <ClientActionTile
          icon="supervisor-account"
          label="Shareholders"
          hint="Investor register and commitments"
          onPress={() => router.push('/(staff)/investments/shareholders' as Href)}
        />
        <ClientActionTile
          icon="attach-money"
          label="Investments"
          hint="Approve or reject pending subscriptions"
          onPress={() => router.push('/(staff)/investments/subscriptions' as Href)}
        />
        <ClientActionTile
          icon="pie-chart"
          label="Capital allocation"
          hint="Fund pools assigned to services and branches"
          onPress={() => router.push('/(staff)/investments/allocations' as Href)}
        />
      </ClientActionGrid>

      <ClientSectionTitle title="Repayments" />
      <ClientActionGrid>
        <ClientActionTile
          icon="insights"
          label="Institution repayments"
          hint="Executive list and collection oversight"
          onPress={() => router.push(repayHref as Href)}
        />
        <ClientActionTile
          icon="event"
          label="Due today"
          hint="Branch collection activity"
          onPress={() => router.push('/(staff)/repayments?tab=due' as Href)}
        />
        <ClientActionTile
          icon="warning"
          label="Overdue"
          hint="Institutional arrears"
          onPress={() => router.push('/(staff)/repayments?tab=overdue' as Href)}
        />
        <ClientActionTile
          icon="assessment"
          label="Reports"
          hint="Executive analytics"
          onPress={() => router.push('/(staff)/reports' as Href)}
        />
        <AiStudioActionTile />
      </ClientActionGrid>

      <ClientSectionTitle
        title={isGceo ? 'GCEO queue' : 'CEO queue'}
        actionLabel={queueTotal > 0 ? 'See all' : undefined}
        onAction={queueTotal > 0 ? () => router.push(queueHref as Href) : undefined}
      />
      <WorkspaceQueuePreview
        empty={
          isGceo
            ? 'No applications are waiting for GCEO approval.'
            : 'No applications are waiting for CEO decision.'
        }
        items={queue.map((app) => ({
          id: app.id,
          title: app.client_name?.trim() || app.application_number || `Application #${app.id}`,
          meta: [app.status, app.origination_stage].filter(Boolean).join(' · ').replace(/_/g, ' '),
        }))}
      />
      <WorkspaceSignOut embedded={embedded} />
    </StaffScreen>
  );
}

export function CeoWorkspace({ embedded = false }: { embedded?: boolean }) {
  return <ExecutiveWorkspace audience="ceo" embedded={embedded} />;
}

export function GceoWorkspace({ embedded = false }: { embedded?: boolean }) {
  return <ExecutiveWorkspace audience="gceo" embedded={embedded} />;
}
