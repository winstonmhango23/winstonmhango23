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
  apiGetOperationsOfficerDashboard,
  apiGetOperationsOfficerOpsQueue,
  type ApiOperationsOfficerDashboard,
  type RoleQueueApplication,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { opsQueueDetailHref } from '@/lib/ops-records';
import { getStoredAuth } from '@/lib/storage';
import type { RepaymentParHealthSnapshot } from '@/lib/staff/repayment-par-health';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';
import { useNotificationsStore } from '@/store/notifications';

export function OperationsOfficerWorkspace({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const ensureStaffBootstrap = useHomeBootstrapStore((s) => s.ensureStaffBootstrap);
  const [dashboard, setDashboard] = useState<ApiOperationsOfficerDashboard | null>(null);
  const [queue, setQueue] = useState<RoleQueueApplication[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);

  const loadWorkspace = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const [dash, opsQueue] = await Promise.all([
        apiGetOperationsOfficerDashboard(auth.token),
        apiGetOperationsOfficerOpsQueue(auth.token, { limit: 8 }),
      ]);
      if (dash) setDashboard(dash);
      setQueue(opsQueue.items);
      setQueueTotal(opsQueue.total);
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    void ensureStaffBootstrap();
    void loadWorkspace();
  }, [ensureStaffBootstrap, loadWorkspace]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'Officer';
  const opsCount = dashboard?.operations_queue_count ?? queueTotal;
  const pendingRepay = dashboard?.repayments_pending_count ?? 0;
  const disbToday = dashboard?.disbursements_today_count ?? 0;
  const outstanding =
    (dashboard?.portfolio?.outstanding_principal_minor ?? 0) +
    (dashboard?.portfolio?.outstanding_interest_minor ?? 0);
  const attention =
    opsCount > 0 ? `${opsCount} in ops queue` : pendingRepay > 0 ? `${pendingRepay} receipts pending` : 'All clear';

  return (
    <StaffScreen
      scroll
      onRefresh={loadWorkspace}
      header={{
        title: 'Operations Officer',
        subtitle: 'Queued loans, receipt records, and repayment escalation',
        showNotifications: true,
        unreadCount,
        stats: [
          { label: 'Ops queue', value: String(opsCount) },
          { label: 'Pending receipts', value: String(pendingRepay) },
          { label: 'Disbursed today', value: String(disbToday) },
        ],
      }}
    >
      <ClientHeroCard
        greeting={`Welcome back, ${firstName}`}
        outstandingLabel="Outstanding book"
        outstandingAmount={formatMinorMWK(outstanding)}
        nextDueLabel="Attention needed"
        nextDueDate={attention}
        nextDueHint={`${dashboard?.legacy_booking_count ?? 0} legacy · ${dashboard?.penalty_alerts_count ?? 0} penalty alerts`}
        loanCount={dashboard?.portfolio?.active_loan_count ?? 0}
        inArrears={0}
      />

      <ClientSectionTitle title="Portfolio at Risk" actionLabel="Collections" onAction={() => router.push('/(staff)/collections' as Href)} />
      <RepaymentParHealthPanel
        snapshot={
          (dashboard?.repayment_par_health ?? dashboard?.portfolio?.repayment_par_health) as
            | RepaymentParHealthSnapshot
            | null
            | undefined
        }
        compact
        onOpenCollections={() => router.push('/(staff)/collections' as Href)}
      />

      <ClientSectionTitle title="Legacy credit books" />
      <LoanBookTiles variant="legacy-queue" />

      <ClientSectionTitle title="Escalation & handoff" />
      <ClientActionGrid>
        <ClientActionTile
          icon="handshake"
          label="Ops handoff queue"
          hint={`${opsCount} files after CEO release`}
          variant="accent"
          onPress={() => router.push('/(staff)/operations/ops-queue' as Href)}
        />
        <ClientActionTile
          icon="payments"
          label="Recent disbursements"
          hint="Completed funding outcomes"
          onPress={() => router.push('/(staff)/operations/disbursements' as Href)}
        />
        <ClientActionTile
          icon="receipt-long"
          label="Repayments"
          hint="Current loans, legacy book, then receipts to escalate"
          onPress={() => router.push('/(staff)/operations/repayments' as Href)}
        />
        <AiStudioActionTile />
      </ClientActionGrid>

      <ClientSectionTitle title="Repayments" />
      <ClientActionGrid>
        <ClientActionTile
          icon="event"
          label="Due today"
          hint="Ledger of loans due today"
          onPress={() => router.push('/(staff)/repayments?tab=due' as Href)}
        />
        <ClientActionTile
          icon="hourglass-empty"
          label="Awaiting verification"
          hint={`${pendingRepay} receipts in operations verification`}
          variant={pendingRepay > 0 ? 'accent' : undefined}
          onPress={() => router.push('/(staff)/repayments?tab=awaiting' as Href)}
        />
        <ClientActionTile
          icon="warning"
          label="Overdue"
          hint="Arrears needing follow-up"
          onPress={() => router.push('/(staff)/repayments?tab=overdue' as Href)}
        />
      </ClientActionGrid>

      <ClientSectionTitle
        title="Ops action queue"
        actionLabel={queueTotal > 0 ? 'See all' : undefined}
        onAction={queueTotal > 0 ? () => router.push('/(staff)/operations/ops-queue' as Href) : undefined}
      />
      <WorkspaceQueuePreview
        empty="No applications are waiting in the post-disbursement ops queue."
        hrefForItem={(id) => opsQueueDetailHref(id)}
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
