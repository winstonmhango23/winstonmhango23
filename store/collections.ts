import { create } from 'zustand';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';
import * as collectionsApi from '@/lib/data/collections-api';
import type {
  DelinquentLoan,
  CollectionCase,
  CollectionActivity,
  CollectionStats,
} from '@/lib/data/collections-api';
import { runOnlineFirstRemote } from '@/lib/online-first-remote';
import { enqueueSync, runSyncIfOnline } from '@/lib/sync/sync-service';

/** Matches lib/data QUEUED_OFFLINE_ID — kept local to avoid store↔data cycles. */
const QUEUED_OFFLINE_ID = -1;

interface CollectionsState {
  delinquentLoans: DelinquentLoan[];
  collectionCases: CollectionCase[];
  selectedCase: CollectionCase | null;
  caseActivities: CollectionActivity[];
  stats: CollectionStats | null;
  loading: boolean;
  loadingCases: boolean;
  fetchDelinquentLoans: () => Promise<void>;
  fetchCollectionCases: (status?: string) => Promise<void>;
  fetchCollectionCase: (caseId: number) => Promise<void>;
  fetchCaseActivities: (caseId: number) => Promise<void>;
  fetchStats: () => Promise<void>;
  createCase: (data: {
    loan_id: number;
    client_id: number;
    priority?: string;
    notes?: string;
  }) => Promise<CollectionCase | null>;
  createActivity: (
    caseId: number,
    data: { activity_type: string; description: string }
  ) => Promise<CollectionActivity | null>;
  resolveCase: (
    caseId: number,
    data: { resolution_outcome: string; notes?: string; settlement_amount?: number }
  ) => Promise<CollectionCase | null>;
  assignCaseToMe: (caseId: number) => Promise<CollectionCase | null>;
}

function queuedCaseStub(data: {
  loan_id: number;
  client_id: number;
  priority?: string;
  notes?: string;
}): CollectionCase {
  return {
    id: QUEUED_OFFLINE_ID,
    client_id: data.client_id,
    client_name: '',
    loan_id: data.loan_id,
    loan_account_number: '',
    status: 'OPEN',
    priority: (data.priority as CollectionCase['priority']) || 'MEDIUM',
    outstanding_amount: 0,
    days_in_arrears: 0,
    opened_at: new Date().toISOString(),
    notes: data.notes,
  };
}

export const useCollectionsStore = create<CollectionsState>((set) => ({
  delinquentLoans: [],
  collectionCases: [],
  selectedCase: null,
  caseActivities: [],
  stats: null,
  loading: false,
  loadingCases: false,

  fetchDelinquentLoans: async () => {
    set({ loading: true });
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const items = await collectionsApi.apiGetDelinquentLoans(auth.token);
      set({ delinquentLoans: items });
    } catch {
      // Ignore
    } finally {
      set({ loading: false });
    }
  },

  fetchCollectionCases: async (status?: string) => {
    set({ loadingCases: true });
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const items = await collectionsApi.apiGetCollectionCases(auth.token, status);
      set({ collectionCases: items });
    } catch {
      // Ignore
    } finally {
      set({ loadingCases: false });
    }
  },

  fetchCollectionCase: async (caseId: number) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const item = await collectionsApi.apiGetCollectionCase(auth.token, caseId);
      set({ selectedCase: item });
    } catch {
      // Ignore
    }
  },

  fetchCaseActivities: async (caseId: number) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const items = await collectionsApi.apiGetCollectionActivities(auth.token, caseId);
      set({ caseActivities: items });
    } catch {
      // Ignore
    }
  },

  fetchStats: async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const stats = await collectionsApi.apiGetCollectionStats(auth.token);
      set({ stats });
    } catch {
      // Ignore
    }
  },

  createCase: async (data) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return null;

      const remote = await runOnlineFirstRemote('createCollectionCase', async () => {
        const token = (await getStoredAuth())?.token;
        if (!token) throw new Error('Not signed in');
        return collectionsApi.apiCreateCollectionCase(token, data);
      });
      if (remote.ok) {
        if (!remote.value) return null;
        set((s) => ({ collectionCases: [remote.value!, ...s.collectionCases] }));
        return remote.value;
      }

      const localId = `case-${Date.now()}`;
      await enqueueSync('CREATE_COLLECTION_CASE', 'collection_case', localId, { ...data });
      await runSyncIfOnline({ forceNetworkCheck: true });
      const stub = queuedCaseStub(data);
      set((s) => ({ collectionCases: [stub, ...s.collectionCases] }));
      return stub;
    } catch {
      return null;
    }
  },

  createActivity: async (caseId, data) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return null;
      const staffId = useAuthStore.getState().user?.id ?? auth.user?.id;
      if (!staffId) return null;
      if (!(caseId > 0)) return null;

      const body = { ...data, created_by: staffId };
      const remote = await runOnlineFirstRemote('createCollectionActivity', async () => {
        const token = (await getStoredAuth())?.token;
        if (!token) throw new Error('Not signed in');
        return collectionsApi.apiCreateCollectionActivity(token, caseId, body);
      });
      if (remote.ok) {
        if (!remote.value) return null;
        set((s) => ({ caseActivities: [...s.caseActivities, remote.value!] }));
        return remote.value;
      }

      const localId = `activity-${caseId}-${Date.now()}`;
      await enqueueSync('CREATE_COLLECTION_ACTIVITY', 'collection_activity', localId, {
        case_id: caseId,
        ...body,
      });
      await runSyncIfOnline({ forceNetworkCheck: true });
      const stub: CollectionActivity = {
        id: QUEUED_OFFLINE_ID,
        case_id: caseId,
        activity_type: data.activity_type,
        description: data.description,
        performed_by_name: 'Queued offline',
        created_at: new Date().toISOString(),
      };
      set((s) => ({ caseActivities: [...s.caseActivities, stub] }));
      return stub;
    } catch {
      return null;
    }
  },

  resolveCase: async (caseId, data) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return null;
      if (!(caseId > 0)) return null;

      const remote = await runOnlineFirstRemote('resolveCollectionCase', async () => {
        const token = (await getStoredAuth())?.token;
        if (!token) throw new Error('Not signed in');
        return collectionsApi.apiResolveCollectionCase(token, caseId, data);
      });
      if (remote.ok) {
        if (!remote.value) return null;
        set((s) => ({
          selectedCase: remote.value!,
          collectionCases: s.collectionCases.map((c) => (c.id === caseId ? remote.value! : c)),
        }));
        return remote.value;
      }

      await enqueueSync('RESOLVE_COLLECTION_CASE', 'collection_case', `resolve-${caseId}`, {
        case_id: caseId,
        ...data,
      });
      await runSyncIfOnline({ forceNetworkCheck: true });
      const updated: CollectionCase = {
        ...(useCollectionsStore.getState().selectedCase ?? {
          id: caseId,
          client_name: '',
          loan_id: 0,
          loan_account_number: '',
          status: 'RESOLVED',
          priority: 'MEDIUM',
          outstanding_amount: 0,
          days_in_arrears: 0,
          opened_at: new Date().toISOString(),
        }),
        id: caseId,
        status: 'RESOLVED',
        notes: data.notes,
      };
      set((s) => ({
        selectedCase: updated,
        collectionCases: s.collectionCases.map((c) => (c.id === caseId ? updated : c)),
      }));
      return updated;
    } catch {
      return null;
    }
  },

  assignCaseToMe: async (caseId) => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return null;
      const staffId = useAuthStore.getState().user?.id ?? auth.user?.id;
      if (!staffId) return null;
      if (!(caseId > 0)) return null;

      const remote = await runOnlineFirstRemote('assignCollectionCase', async () => {
        const token = (await getStoredAuth())?.token;
        if (!token) throw new Error('Not signed in');
        return collectionsApi.apiAssignCollectionCase(token, caseId, staffId);
      });
      if (remote.ok) {
        if (!remote.value) return null;
        set((s) => ({
          selectedCase: remote.value!,
          collectionCases: s.collectionCases.map((c) => (c.id === caseId ? remote.value! : c)),
        }));
        return remote.value;
      }

      await enqueueSync('ASSIGN_COLLECTION_CASE', 'collection_case', `assign-${caseId}`, {
        case_id: caseId,
        collector_id: staffId,
      });
      await runSyncIfOnline({ forceNetworkCheck: true });
      const current = useCollectionsStore.getState().selectedCase;
      const updated: CollectionCase = {
        ...(current ?? {
          id: caseId,
          client_name: '',
          loan_id: 0,
          loan_account_number: '',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          outstanding_amount: 0,
          days_in_arrears: 0,
          opened_at: new Date().toISOString(),
        }),
        id: caseId,
        assigned_collector_id: staffId,
        status: current?.status === 'OPEN' ? 'IN_PROGRESS' : (current?.status ?? 'IN_PROGRESS'),
      };
      set((s) => ({
        selectedCase: updated,
        collectionCases: s.collectionCases.map((c) => (c.id === caseId ? updated : c)),
      }));
      return updated;
    } catch {
      return null;
    }
  },
}));
