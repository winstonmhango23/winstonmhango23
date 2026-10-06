/**
 * Reset in-memory Zustand stores when switching / logging out of an account.
 * Does not delete on-disk per-account databases.
 */

import { logger } from '@/lib/logger';

export async function resetAccountScopedMemoryStores(): Promise<void> {
  const tasks: Array<Promise<void>> = [];

  const safe = (label: string, fn: () => void | Promise<void>) => {
    tasks.push(
      (async () => {
        try {
          await fn();
        } catch {
          logger.debug(`Store reset skipped: ${label}`, { module: 'account-scope' });
        }
      })()
    );
  };

  safe('profile', async () => {
    const { useProfileStore } = await import('@/store/profile');
    useProfileStore.setState({
      smsNotifications: true,
      emailNotifications: true,
      pushNotifications: true,
      repaymentReminders: true,
      applicationUpdates: true,
      hydrated: false,
    });
  });

  safe('client-session', async () => {
    const { useClientSessionStore } = await import('@/store/client-session');
    useClientSessionStore.getState().clear();
  });

  safe('accounts', async () => {
    const { useAccountsStore } = await import('@/store/accounts');
    useAccountsStore.setState({
      accounts: [],
      collateralBalance: null,
      collateralLocks: [],
      activity: [],
      loading: false,
      error: null,
    });
  });

  safe('home-bootstrap', async () => {
    const { useHomeBootstrapStore } = await import('@/store/home-bootstrap');
    useHomeBootstrapStore.getState().reset();
  });

  safe('loans', async () => {
    const { useLoansStore } = await import('@/store/loans');
    useLoansStore.setState({ loans: [], loading: false, lastSyncedAt: null });
  });

  safe('applications', async () => {
    const { useApplicationsStore } = await import('@/store/applications');
    useApplicationsStore.setState({
      applications: [],
      loading: false,
      submitting: false,
      branches: [],
    });
  });

  safe('clients', async () => {
    const { useClientsStore } = await import('@/store/clients');
    useClientsStore.setState({
      clients: [],
      loading: false,
      loadingMore: false,
      total: 0,
      page: 1,
      pages: 0,
      hasMore: false,
      searchQuery: '',
    });
  });

  safe('repayments', async () => {
    const { useRepaymentsStore } = await import('@/store/repayments');
    useRepaymentsStore.setState({ repayments: [], loading: false });
  });

  safe('notifications', async () => {
    const { useNotificationsStore } = await import('@/store/notifications');
    useNotificationsStore.setState({
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
    });
  });

  safe('client-notifications', async () => {
    const { useClientNotificationsStore } = await import('@/store/client-notifications');
    useClientNotificationsStore.setState({
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
    });
  });

  await Promise.all(tasks);
  logger.debug('Account-scoped memory stores reset', { module: 'account-scope' });
}
