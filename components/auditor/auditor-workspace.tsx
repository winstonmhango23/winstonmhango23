import { useCallback, useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';

import {
  ClientActionGrid,
  ClientActionTile,
  ClientHeroCard,
  ClientSectionTitle,
  StaffScreen,
} from '@/components/staff-ui';
import { WorkspaceQueuePreview, WorkspaceSignOut } from '@/components/staff/role-workspace-preview';
import {
  apiGetAuditorDashboard,
  apiGetAuditorFindings,
  apiGetAuditorLoanPerformance,
  type ApiAuditorDashboardMetrics,
  type ApiAuditorFinding,
  type ApiAuditorLoanPerformance,
} from '@/lib/data/auditor-api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';
import { useNotificationsStore } from '@/store/notifications';

export function AuditorWorkspace({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const ensureStaffBootstrap = useHomeBootstrapStore((s) => s.ensureStaffBootstrap);
  const [metrics, setMetrics] = useState<ApiAuditorDashboardMetrics | null>(null);
  const [perf, setPerf] = useState<ApiAuditorLoanPerformance | null>(null);
  const [findings, setFindings] = useState<ApiAuditorFinding[]>([]);

  const loadWorkspace = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const [dash, loanPerf, openFindings] = await Promise.all([
        apiGetAuditorDashboard(auth.token),
        apiGetAuditorLoanPerformance(auth.token),
        apiGetAuditorFindings(auth.token, { status: 'OPEN', limit: 6 }),
      ]);
      if (dash) setMetrics(dash);
      if (loanPerf) setPerf(loanPerf);
      setFindings(openFindings.items ?? []);
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    void ensureStaffBootstrap();
    void loadWorkspace();
  }, [ensureStaffBootstrap, loadWorkspace]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'Auditor';
  const openFindings = metrics?.open_findings ?? findings.length;
  const events7d = metrics?.total_events_7d ?? 0;
  const outstanding = perf?.outstanding_balance ?? 0;
  const attention =
    openFindings > 0
      ? `${openFindings} open finding${openFindings === 1 ? '' : 's'}`
      : events7d > 0
        ? `${events7d} trail events (7d)`
        : 'All clear';

  return (
    <StaffScreen
      scroll
      onRefresh={loadWorkspace}
      header={{
        title: 'Internal Auditor',
        subtitle: 'Findings, trail sampling, loan integrity, and regulatory compliance',
        showNotifications: true,
        unreadCount,
        stats: [
          { label: 'Open findings', value: String(openFindings) },
          { label: 'Events 7d', value: String(events7d) },
          { label: 'Loans', value: String(perf?.total_loans ?? 0) },
        ],
      }}
    >
      <ClientHeroCard
        greeting={`Welcome back, ${firstName}`}
        outstandingLabel="Outstanding book"
        outstandingAmount={formatMinorMWK(outstanding)}
        nextDueLabel="Attention needed"
        nextDueDate={attention}
        nextDueHint={`PAR ${(perf?.par_ratio ?? 0).toFixed(1)}% · ${metrics?.total_events_30d ?? 0} events (30d)`}
        loanCount={perf?.total_loans ?? 0}
        inArrears={openFindings}
      />

      <ClientSectionTitle title="Audit work" />
      <ClientActionGrid>
        <ClientActionTile
          icon="gavel"
          label="Findings"
          hint={`${openFindings} open items to track or resolve`}
          variant={openFindings > 0 ? 'accent' : undefined}
          onPress={() => router.push('/(staff)/audit/findings' as Href)}
        />
        <ClientActionTile
          icon="history"
          label="Audit trail"
          hint="Sample AUTH, ACCESS, and operations events"
          onPress={() => router.push('/(staff)/audit/trail' as Href)}
        />
        <ClientActionTile
          icon="security"
          label="Risk & compliance"
          hint="Aging, liquidity, NDTI, CRB, FIA"
          onPress={() => router.push('/(staff)/audit/risk' as Href)}
        />
        <ClientActionTile
          icon="account-balance"
          label="Loan performance"
          hint="PAR, aging buckets, disbursed book"
          onPress={() => router.push('/(staff)/audit/loan-performance' as Href)}
        />
        <ClientActionTile
          icon="pie-chart"
          label="Statistics"
          hint="Severity mix and coverage"
          onPress={() => router.push('/(staff)/audit/statistics' as Href)}
        />
        <ClientActionTile
          icon="people"
          label="Client records"
          hint="KYC and identity verification sample"
          onPress={() => router.push('/(staff)/audit/clients' as Href)}
        />
      </ClientActionGrid>

      <ClientSectionTitle
        title="AI Studio"
        actionLabel="Open"
        onAction={() => router.push('/(staff)/ai-studio' as Href)}
      />
      <ClientActionGrid>
        <ClientActionTile
          icon="auto-awesome"
          label="Findings brief"
          hint="One-click open vs resolved stats"
          onPress={() => router.push('/(staff)/ai-studio' as Href)}
        />
        <ClientActionTile
          icon="fact-check"
          label="Finding operations"
          hint="Plan create or resolve with confirmation"
          onPress={() => router.push('/(staff)/ai-studio' as Href)}
        />
      </ClientActionGrid>

      <ClientSectionTitle
        title="Open findings"
        actionLabel="All"
        onAction={() => router.push('/(staff)/audit/findings' as Href)}
      />
      <WorkspaceQueuePreview
        items={findings.map((f) => ({
          id: f.id,
          title: f.title,
          meta: `${f.severity} · ${f.status}${f.category ? ` · ${f.category}` : ''}`,
        }))}
        empty="No open findings. Use AI Studio or Findings to log a new observation."
        hrefForItem={() => '/(staff)/audit/findings' as Href}
      />

      <WorkspaceSignOut embedded={embedded} />
    </StaffScreen>
  );
}
