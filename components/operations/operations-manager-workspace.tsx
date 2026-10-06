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
  apiGetOperationsManagerDashboard,
  apiGetOperationsManagerHandoffQueue,
  type ApiPortfolioManagerDashboard,
  type RoleQueueApplication,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { opsQueueDetailHref } from '@/lib/ops-records';
import { getStoredAuth } from '@/lib/storage';
import type { RepaymentParHealthSnapshot } from '@/lib/staff/repayment-par-health';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';
import { useNotificationsStore } from '@/store/notifications';

export function OperationsManagerWorkspace({ embedded = false }: { embedded?: boolean }) {
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
      const [dash, handoff] = await Promise.all([
        apiGetOperationsManagerDashboard(auth.token),
        apiGetOperationsManagerHandoffQueue(auth.token, { limit: 8 }),
      ]);
      if (dash) setDashboard(dash);
      setQueue(handoff.items);
      setQueueTotal(handoff.total);
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    void ensureStaffBootstrap();
    void loadWorkspace();
  }, [ensureStaffBootstrap, loadWorkspace]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'Manager';
  const handoff = dashboard?.repayment_handoff_pending_count ?? queueTotal;
  const pendingDisb = dashboard?.pending_disbursement_count ?? 0;
  const credit = dashboard?.with_portfolio_manager_review_count ?? 0;
  const outstanding =
    (dashboard?.total_outstanding_principal_minor ?? 0) +
    (dashboard?.total_outstanding_interest_minor ?? 0);
  const attention =
    handoff > 0 ? `${handoff} repayment handoff` : credit > 0 ? `${credit} credit files` : 'All clear';

  return (
    <StaffScreen
      scroll
      onRefresh={loadWorkspace}
      header={{
        title: 'Operations Manager',
        subtitle: 'Acknowledge repayment tracking, approve escalations, and oversee credit',
        showNotifications: true,
        unreadCount,
        stats: [
          { label: 'Handoff', value: String(handoff) },
          { label: 'Credit queue', value: String(credit) },
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

      <ClientSectionTitle title="Portfolio at Risk" actionLabel="PAR" onAction={() => router.push('/(staff)/par' as Href)} />
      <RepaymentParHealthPanel
        snapshot={dashboard?.repayment_par_health as RepaymentParHealthSnapshot | null | undefined}
        compact
        onOpenCollections={() => router.push('/(staff)/collections' as Href)}
      />

      <ClientSectionTitle title="Legacy credit books" />
      <LoanBookTiles variant="legacy-queue" />

      <ClientSectionTitle title="Escalation queues" />
      <ClientActionGrid>
        <ClientActionTile
          icon="verified"
          label="Repayment handoff"
          hint={`${handoff} files awaiting OPS_MANAGER_ACKNOWLEDGE`}
          variant="accent"
          onPress={() => router.push('/(staff)/operations-manager/handoff' as Href)}
        />
        <ClientActionTile
          icon="gavel"
          label="Escalated repayments"
          hint="Approve or reject officer escalations"
          onPress={() => router.push('/(staff)/operations-manager/escalated-repayments' as Href)}
        />
        <ClientActionTile
          icon="assignment-turned-in"
          label="Credit queue"
          hint={`${credit} CIO-verified files in the PM band`}
          onPress={() => router.push('/(staff)/operations-manager/credit-queue' as Href)}
        />
        <ClientActionTile
          icon="apartment"
          label="Executive pipeline"
          hint={`CEO ${dashboard?.with_ceo_review_count ?? 0} · GCEO ${dashboard?.with_gceo_review_count ?? 0}`}
          onPress={() => router.push('/(staff)/operations-manager/executive' as Href)}
        />
      </ClientActionGrid>

      <ClientSectionTitle title="Servicing" />
      <ClientActionGrid>
        <ClientActionTile
          icon="payment"
          label="Repayments"
          hint="Current loans and the SME / Group legacy book"
          onPress={() => router.push('/(staff)/operations/repayments' as Href)}
        />
        <ClientActionTile
          icon="gavel"
          label="Collections"
          hint="Arrears and recovery"
          onPress={() => router.push('/(staff)/collections' as Href)}
        />
        <ClientActionTile
          icon="assessment"
          label="Reports"
          hint="Operations and portfolio analytics"
          onPress={() => router.push('/(staff)/reports' as Href)}
        />
        <AiStudioActionTile />
      </ClientActionGrid>

      <ClientSectionTitle
        title="Handoff awaiting you"
        actionLabel={queueTotal > 0 ? 'See all' : undefined}
        onAction={
          queueTotal > 0 ? () => router.push('/(staff)/operations-manager/handoff' as Href) : undefined
        }
      />
      <WorkspaceQueuePreview
        empty="No repayment-tracking files are waiting for acknowledgement."
        hrefForItem={(id) => opsQueueDetailHref(id, true)}
        items={queue.map((app) => ({
          id: app.id,
          title: app.client_name?.trim() || app.application_number || `Application #${app.id}`,
          meta: (app.origination_stage || app.status || '').replace(/_/g, ' '),
        }))}
      />
      <WorkspaceSignOut embedded={embedded} />
    </StaffScreen>
  );
}
