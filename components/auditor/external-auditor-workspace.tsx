import { useCallback, useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';

import {
  ClientActionGrid,
  ClientActionTile,
  ClientHeroCard,
  ClientSectionTitle,
  StaffScreen,
} from '@/components/staff-ui';
import {
  apiGetExternalAuditorDashboard,
  clearExternalAuditorSession,
  getExternalAuditorSession,
  getExternalAuditorToken,
  type ExternalDashboardMetrics,
  type ExternalAuditorSession,
} from '@/lib/data/external-auditor-api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

export function ExternalAuditorWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<ExternalAuditorSession | null>(null);
  const [metrics, setMetrics] = useState<ExternalDashboardMetrics | null>(null);

  const loadWorkspace = useCallback(async () => {
    const token = await getExternalAuditorToken();
    if (!token) {
      router.replace('/external-auditor/login' as Href);
      return;
    }
    setSession(await getExternalAuditorSession());
    try {
      setMetrics(await apiGetExternalAuditorDashboard(token));
    } catch {
      router.replace('/external-auditor/login' as Href);
    }
  }, [router]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const firstName = session?.external_auditor_name?.split(' ')[0] ?? 'Auditor';

  return (
    <StaffScreen
      scroll
      onRefresh={loadWorkspace}
      header={{
        title: 'External Auditor',
        subtitle: 'Read-only engagement: loan book, clients, and risk',
        stats: [
          { label: 'Loans', value: String(metrics?.total_loans ?? 0) },
          { label: 'PAR', value: `${(metrics?.par_ratio ?? 0).toFixed(1)}%` },
        ],
      }}
    >
      <ClientHeroCard
        greeting={`Welcome, ${firstName}`}
        outstandingLabel="Outstanding book"
        outstandingAmount={formatMinorMWK(metrics?.outstanding_balance ?? 0)}
        nextDueLabel="Engagement"
        nextDueDate={session?.expires_at ? `Expires ${session.expires_at}` : 'Scoped access'}
        nextDueHint="Principals and repayments are visible per your granted scopes"
        loanCount={metrics?.total_loans ?? 0}
        inArrears={0}
      />

      <ClientSectionTitle title="Scoped modules" />
      <ClientActionGrid>
        <ClientActionTile
          icon="account-balance"
          label="Loan performance"
          hint="PAR, aging, disbursed and outstanding"
          onPress={() => router.push('/external-auditor/loans' as Href)}
        />
        <ClientActionTile
          icon="security"
          label="Risk & compliance"
          hint="Aging clients and liquidity"
          onPress={() => router.push('/external-auditor/risk' as Href)}
        />
        <ClientActionTile
          icon="people"
          label="Client records"
          hint="Identity and loan history sample"
          onPress={() => router.push('/external-auditor/clients' as Href)}
        />
      </ClientActionGrid>

      <ClientSectionTitle title="Session" />
      <ClientActionGrid>
        <ClientActionTile
          icon="logout"
          label="End engagement"
          hint="Clear this access token from the device"
          onPress={async () => {
            await clearExternalAuditorSession();
            router.replace('/external-auditor/login' as Href);
          }}
        />
      </ClientActionGrid>
    </StaffScreen>
  );
}
