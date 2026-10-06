import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { KycAlertBanner } from '@/components/client-kyc/kyc-alert-banner';
import {
  ClientActionGrid,
  ClientActionTile,
  ClientHeroCard,
  ClientScreen,
  ClientSectionTitle,
} from '@/components/client-ui';
import { NotificationListItem } from '@/components/notification-list-item';
import { HomeBootstrapOverlay } from '@/components/ui/home-bootstrap-overlay';
import { useAuthStore } from '@/store/auth';
import { useLoansStore, useApplicationsStore, useClientNotificationsStore } from '@/store';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { clientApplicationDisplayStatus } from '@/lib/loan-origination/client-application-status';
import { loanOutstandingForViewer } from '@/lib/loan-origination/group-share-display';
import { useHomeBootstrapStore } from '@/store/home-bootstrap';
import { useClientHeaderTrailing } from '@/hooks/use-client-header-trailing';

export default function ClientDashboardScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const ensureClientBootstrap = useHomeBootstrapStore((s) => s.ensureClientBootstrap);
  const clientReady = useHomeBootstrapStore((s) => s.client.ready);
  const { loans } = useLoansStore();
  const { applications } = useApplicationsStore();
  const { notifications, unreadCount } = useClientNotificationsStore();
  const headerTrailing = useClientHeaderTrailing();

  useEffect(() => {
    void ensureClientBootstrap();
  }, [ensureClientBootstrap]);

  const summary = useMemo(() => {
    // Portal parity: group members see share outstanding, not full facility balance.
    const active = loans.filter((l) => loanOutstandingForViewer(l) > 0);
    const totalOutstanding = active.reduce((s, l) => s + loanOutstandingForViewer(l), 0);
    const inArrears = loans.filter((l) => (l.days_in_arrears ?? 0) > 0).length;
    const nextLoan = [...active]
      .sort((a, b) => (a.days_until_next_repayment ?? 999) - (b.days_until_next_repayment ?? 999))[0];
    const pendingApps = applications.filter((a) => {
      const label = clientApplicationDisplayStatus(a.status, a.origination_stage);
      return label === 'Submitted' || label === 'Returned' || a.status === 'PENDING';
    }).length;

    return { totalOutstanding, inArrears, nextLoan, activeCount: active.length, pendingApps };
  }, [loans, applications]);

  const firstName = user?.fullName?.split(' ')[0] ?? 'there';
  const bootstrapping = !clientReady;

  return (
    <View style={styles.root}>
      <ClientScreen
        scroll
        header={{
          title: 'CoFi',
          subtitle: 'Your personal banking hub',
          showNotifications: headerTrailing.showNotifications,
          showProfile: headerTrailing.showProfile,
          unreadCount,
        }}
      >
        <KycAlertBanner />

        <ClientHeroCard
          greeting={`Good day, ${firstName}`}
          outstandingAmount={formatMinorMWK(summary.totalOutstanding)}
          nextDueDate={summary.nextLoan?.next_due_date}
          nextDueHint={
            summary.nextLoan?.days_until_next_repayment != null
              ? summary.nextLoan.days_until_next_repayment <= 0
                ? 'Payment due now'
                : `Due in ${summary.nextLoan.days_until_next_repayment} days`
              : summary.activeCount === 0
                ? 'No active loans'
                : undefined
          }
          loanCount={summary.activeCount}
          inArrears={summary.inArrears}
        />

        <ClientSectionTitle title="Quick actions" />
        <ClientActionGrid>
          <ClientActionTile
            icon="payments"
            label="Make a payment"
            hint="View dues & pay via mobile money"
            variant="accent"
            onPress={() => router.push('/(client)/repayments')}
          />
          <ClientActionTile
            icon="description"
            label="New application"
            hint={summary.pendingApps > 0 ? `${summary.pendingApps} in progress` : 'Apply for a loan'}
            onPress={() => router.push('/(client)/applications')}
          />
          <ClientActionTile
            icon="account-balance"
            label="My loans"
            hint={`${summary.activeCount} active`}
            onPress={() => router.push('/(client)/loans')}
          />
          <ClientActionTile
            icon="account-balance-wallet"
            label="Accounts"
            hint="Savings & collateral"
            onPress={() => router.push('/(client)/accounts' as Href)}
          />
          <ClientActionTile
            icon="folder"
            label="Documents"
            hint="Profile & loan files"
            onPress={() => router.push('/(client)/documents' as Href)}
          />
          <ClientActionTile
            icon="shield"
            label="Collateral"
            hint="Cash, vault & pledges"
            onPress={() => router.push('/(client)/collateral-vault' as Href)}
          />
        </ClientActionGrid>

        {notifications.length > 0 ? (
          <>
            <ClientSectionTitle
              title="Recent alerts"
              actionLabel="See all"
              onAction={() => router.push('/(client)/notifications' as Href)}
            />
            {notifications.slice(0, 3).map((n) => (
              <NotificationListItem
                key={n.id}
                title={n.title}
                message={n.message}
                type={n.notification_type}
                createdAt={n.created_at}
                unread={!n.is_read}
                compact
                onPress={() => router.push(`/(client)/notifications/${n.id}` as Href)}
              />
            ))}
          </>
        ) : null}
      </ClientScreen>

      <HomeBootstrapOverlay
        visible={bootstrapping}
        label="Loading your dashboard…"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
