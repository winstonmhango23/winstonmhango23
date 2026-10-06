import { create } from 'zustand';

import { USE_API } from '@/lib/config-flags';

interface PortalBootstrap {
  loading: boolean;
  ready: boolean;
}

interface HomeBootstrapState {
  client: PortalBootstrap;
  staff: PortalBootstrap;
  ensureClientBootstrap: () => Promise<void>;
  ensureStaffBootstrap: () => Promise<void>;
  reset: () => void;
}

const idlePortal = (): PortalBootstrap => ({ loading: false, ready: false });

let clientInFlight: Promise<void> | null = null;
let staffInFlight: Promise<void> | null = null;

async function runClientBootstrap(): Promise<void> {
  const { prefetchLoanProductsForCurrentUser } = await import(
    '@/lib/loan-products/loan-products-cache'
  );
  const { useAuthStore } = await import('@/store/auth');
  const { useClientSessionStore } = await import('@/store/client-session');

  const token = useAuthStore.getState().token;
  if (!token) return;

  const tasks: Promise<unknown>[] = [prefetchLoanProductsForCurrentUser()];

  let session = useClientSessionStore.getState().session;
  if (!session) {
    session = await useClientSessionStore.getState().fetchSession(token);
  }

  const dashboardEnabled =
    session?.kyc_is_complete === true || session?.has_existing_loans === true;

  if (dashboardEnabled) {
    const {
      useLoansStore,
      useApplicationsStore,
      useClientNotificationsStore,
    } = await import('@/store');

    tasks.push(
      useLoansStore.getState().fetchLoans(),
      useApplicationsStore.getState().fetchApplications(),
      useClientNotificationsStore.getState().fetchNotifications(),
      useClientNotificationsStore.getState().refreshUnreadCount()
    );
  }

  await Promise.allSettled(tasks);
}

async function runStaffBootstrap(): Promise<void> {
  const { prefetchLoanProductsForCurrentUser } = await import(
    '@/lib/loan-products/loan-products-cache'
  );
  const {
    useApplicationsStore,
    useLoansStore,
    useNotificationsStore,
    useClientsStore,
  } = await import('@/store');
  const { useCollectionsStore } = await import('@/store/collections');
  const { useAuthStore } = await import('@/store/auth');
  const { useRepaymentsStore } = await import('@/store/repayments');
  const { staffListFetchOpts, writeCioDashboardCache } = await import('@/lib/staff/cio-offline');
  const { apiGetCioDashboard } = await import('@/lib/data/api');
  const { getStoredAuth } = await import('@/lib/storage');

  const user = useAuthStore.getState().user;
  const listOpts = staffListFetchOpts(user);

  await Promise.allSettled([
    prefetchLoanProductsForCurrentUser(),
    useAuthStore.getState().fetchPermissions(),
    useApplicationsStore.getState().fetchApplications({
      supervisedOnly: listOpts.supervisedOnly,
      creditBook: listOpts.creditBook,
    }),
    useLoansStore.getState().fetchLoans({ creditBook: listOpts.creditBook }),
    useNotificationsStore.getState().fetchNotifications(),
    useClientsStore.getState().fetchClients(),
    useCollectionsStore.getState().fetchStats(),
    useCollectionsStore.getState().fetchDelinquentLoans(),
    useRepaymentsStore.getState().fetchHub(),
    (async () => {
      if (!listOpts.supervisedOnly) return;
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const dashboard = await apiGetCioDashboard(auth.token);
      if (dashboard) await writeCioDashboardCache(dashboard);
    })(),
  ]);
}

function markPortalReady(portal: 'client' | 'staff') {
  useHomeBootstrapStore.setState(() => ({
    [portal]: { loading: false, ready: true },
  }));
}

export const useHomeBootstrapStore = create<HomeBootstrapState>((set, get) => ({
  client: idlePortal(),
  staff: idlePortal(),

  ensureClientBootstrap: async () => {
    if (get().client.ready) return;
    if (!USE_API) {
      set({ client: { loading: false, ready: true } });
      return;
    }
    if (clientInFlight) {
      await clientInFlight;
      return;
    }

    set((state) => ({ client: { ...state.client, loading: true } }));

    clientInFlight = runClientBootstrap()
      .catch(() => undefined)
      .finally(() => {
        clientInFlight = null;
        markPortalReady('client');
      });

    await clientInFlight;
  },

  ensureStaffBootstrap: async () => {
    if (get().staff.ready) return;
    if (!USE_API) {
      set({ staff: { loading: false, ready: true } });
      return;
    }
    if (staffInFlight) {
      await staffInFlight;
      return;
    }

    set((state) => ({ staff: { ...state.staff, loading: true } }));

    staffInFlight = runStaffBootstrap()
      .catch(() => undefined)
      .finally(() => {
        staffInFlight = null;
        markPortalReady('staff');
      });

    await staffInFlight;
  },

  reset: () => {
    clientInFlight = null;
    staffInFlight = null;
    set({ client: idlePortal(), staff: idlePortal() });
  },
}));
