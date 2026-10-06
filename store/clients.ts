/**
 * Clients store – for staff loan application and clients screen.
 * Uses API when USE_API; SQLite when EXPO_PUBLIC_USE_API=false.
 * Supports paginated fetch, infinite scroll, and debounced search.
 */

import { create } from 'zustand';
import * as data from '@/lib/data';

export interface Client {
  id: string;
  name: string;
  phoneNumber?: string;
  nationalId?: string;
  email?: string;
  address?: string;
  occupation?: string;
  monthlyIncome?: number;
  customerNumber?: string;
  photoUri?: string;
  idDocumentUri?: string;
  idDocumentBackUri?: string;
  groupConstitutionUri?: string;
  groupPhotoUri?: string;
  isVerified?: boolean;
  isActive?: boolean;
  clientType?: string;
  parentClientId?: string | null;
  memberCount?: number;
  isGroupAdmin?: boolean;
  groupRole?: string | null;
  syncStatus?: 'pending' | 'synced' | 'failed';
}

function rowToClient(row: data.ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phone_number,
    nationalId: row.national_id,
    email: row.email,
    address: row.address,
    occupation: row.occupation,
    monthlyIncome: row.monthly_income,
    customerNumber: row.customer_number,
    photoUri: row.photo_uri,
    idDocumentUri: row.id_document_uri,
    idDocumentBackUri: row.id_document_back_uri,
    groupConstitutionUri: row.group_constitution_uri,
    groupPhotoUri: row.group_photo_uri,
    isVerified: row.is_verified ?? true,
    isActive: row.is_active ?? true,
    clientType: row.client_type,
    parentClientId: row.parent_client_id ?? undefined,
    memberCount: row.member_count,
    isGroupAdmin: row.is_group_admin,
    groupRole: row.group_role ?? undefined,
    syncStatus: row.sync_status,
  };
}

function clientToRow(c: Partial<Client>): Partial<data.ClientRow> {
  const row: Partial<data.ClientRow> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.phoneNumber !== undefined) row.phone_number = c.phoneNumber;
  if (c.nationalId !== undefined) row.national_id = c.nationalId;
  if (c.email !== undefined) row.email = c.email;
  if (c.address !== undefined) row.address = c.address;
  if (c.occupation !== undefined) row.occupation = c.occupation;
  if (c.monthlyIncome !== undefined) row.monthly_income = c.monthlyIncome;
  if (c.customerNumber !== undefined) row.customer_number = c.customerNumber;
  if (c.photoUri !== undefined) row.photo_uri = c.photoUri;
  if (c.idDocumentUri !== undefined) row.id_document_uri = c.idDocumentUri;
  if (c.idDocumentBackUri !== undefined) row.id_document_back_uri = c.idDocumentBackUri;
  if (c.groupConstitutionUri !== undefined) {
    row.group_constitution_uri = c.groupConstitutionUri;
  }
  return row;
}

export type StatusFilter = 'all' | 'verified' | 'unverified' | 'active' | 'inactive' | 'unassigned';

interface ClientsState {
  clients: Client[];
  loading: boolean;
  loadingMore: boolean;
  total: number;
  page: number;
  pages: number;
  hasMore: boolean;
  searchQuery: string;
  statusFilter: StatusFilter;
  fetchClients: (reset?: boolean, opts?: { excludeGroupMembers?: boolean }) => Promise<void>;
  loadMoreClients: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: StatusFilter) => void;
  createClient: (data: {
    name: string;
    phoneNumber?: string;
    nationalId?: string;
    email?: string;
    address?: string;
    client_type?: 'INDIVIDUAL' | 'SME' | 'COOPERATIVE' | 'GROUP';
    business_location?: import('@/lib/data/geolocation-types').GeolocationInput;
    districtId?: number;
    kyc?: import('@/lib/client-portal/kyc-completion-calculator').ClientKYCData;
    localPreviews?: Partial<Record<import('@/lib/client-portal/api').KycUploadField, string>>;
    saveMode?: 'draft' | 'finished';
  }) => Promise<Client & { savedOffline?: boolean }>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  getClient: (id: string) => Promise<Client | null>;
  verifyClient: (id: string) => Promise<void>;
  assignClientToOfficer: (clientId: string, staffId: number) => Promise<void>;
}

export const useClientsStore = create<ClientsState>((set, get) => ({
  clients: [],
  loading: false,
  loadingMore: false,
  total: 0,
  page: 0,
  pages: 0,
  hasMore: false,
  searchQuery: '',
  statusFilter: 'all',

  setSearchQuery: (query) => set({ searchQuery: query }),

  setStatusFilter: (filter) => set({ statusFilter: filter }),

  fetchClients: async (_reset = true, opts?: { excludeGroupMembers?: boolean }) => {
    set({ loading: true });
    const { searchQuery, statusFilter } = get();
    try {
      const result = await data.getClientsPaginated({
        page: 1,
        limit: 20,
        search: searchQuery || undefined,
        statusFilter: statusFilter !== 'all' ? statusFilter : undefined,
        exclude_group_members: opts?.excludeGroupMembers ?? true,
      });
      const clients = result.items.map(rowToClient);
      set({
        clients,
        total: result.total,
        page: result.page,
        pages: result.pages,
        hasMore: result.page < result.pages,
        loading: false,
      });
    } catch {
      // Keep existing clients on error (e.g. offline), just stop loading
      set({ loading: false });
    }
  },

  loadMoreClients: async () => {
    const { loading, loadingMore, hasMore, page, searchQuery, statusFilter } = get();
    if (loading || loadingMore || !hasMore) return;
    set({ loadingMore: true });
    try {
      const result = await data.getClientsPaginated({
        page: page + 1,
        limit: 20,
        search: searchQuery || undefined,
        statusFilter: statusFilter !== 'all' ? statusFilter : undefined,
        exclude_group_members: true,
      });
      const newClients = result.items.map(rowToClient);
      set((s) => ({
        clients: [...s.clients, ...newClients],
        page: result.page,
        pages: result.pages,
        hasMore: result.page < result.pages,
        loadingMore: false,
      }));
    } catch {
      set({ loadingMore: false });
    }
  },

  createClient: async (input) => {
    const hasKyc =
      input.saveMode != null ||
      input.kyc != null ||
      (input.localPreviews && Object.keys(input.localPreviews).length > 0) ||
      input.districtId != null;

    const row = hasKyc
      ? await data.createClientWithKyc({
          name: input.name.trim(),
          phone_number: input.phoneNumber?.trim(),
          national_id: input.nationalId?.trim(),
          address: input.address?.trim(),
          email: input.email?.trim(),
          client_type: input.client_type,
          business_location: input.business_location,
          district_id: input.districtId,
          kyc: input.kyc,
          localPreviews: input.localPreviews,
          saveMode: input.saveMode ?? 'draft',
        })
      : await data.createClient({
          name: input.name.trim(),
          phone_number: input.phoneNumber?.trim(),
          national_id: input.nationalId?.trim(),
          address: input.address?.trim(),
          email: input.email?.trim(),
          client_type: input.client_type,
          business_location: input.business_location,
        });
    const newClient = rowToClient(row);
    set((s) => ({
      clients: [newClient, ...s.clients],
      total: s.total + 1,
    }));
    return {
      ...newClient,
      savedOffline: row.sync_status === 'pending',
    };
  },

  updateClient: async (id, updates) => {
    const rowUpdates = clientToRow(updates);
    if (Object.keys(rowUpdates).length === 0) return;
    await data.updateClient(id, rowUpdates);
    set((s) => ({
      clients: s.clients.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  },

  getClient: async (id) => {
    const row = await data.getClient(id);
    return row ? rowToClient(row) : null;
  },

  verifyClient: async (id) => {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) throw new Error('Invalid client ID');
    const { useAuthStore } = await import('@/store/auth');
    const { canStaffActivateOrVerifyClient } = await import('@/lib/staff/client-activation');
    const auth = useAuthStore.getState();
    if (!canStaffActivateOrVerifyClient(auth.user, auth.hasPermission)) {
      throw new Error(
        'Only a loan officer or authorized staff can activate or verify client accounts.'
      );
    }
    await data.verifyClient(numId);
    await get().fetchClients(true);
  },

  assignClientToOfficer: async (clientId, staffId) => {
    const numId = parseInt(clientId, 10);
    if (isNaN(numId)) throw new Error('Invalid client ID');
    const { getStoredAuth } = await import('@/lib/storage');
    const auth = await getStoredAuth();
    if (!auth?.token) throw new Error('Sign in again to assign this client.');
    await data.api.apiAssignClientToStaff(auth.token, numId, staffId);
    await get().fetchClients(true);
  },
}));
