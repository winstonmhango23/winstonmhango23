/**
 * Data layer – online-first with SQLite cache + offline queue fallback.
 * USE_API=true (default): attempt remote create (with retries) → cache local.
 * SQLite + sync_queue is used only when there is no link, or after network
 * retries are exhausted. USE_API=false: SQLite only (demo/local).
 */

import * as sqlite from './sqlite';
import * as api from './api';
import * as accountsApi from './accounts-api';
import * as savingsApi from './savings-api';
import { ApiClientError } from '@/lib/api-client';
import { getAuthToken } from '@/lib/auth-token';
import { getStoredAuth } from '@/lib/storage';
import { validateAndRefreshSession } from '@/lib/offline-auth/session-validator';
import { enqueueSync, readQueuedPayload, runSyncIfOnline } from '@/lib/sync/sync-service';
import { pushLoanApplicationToRemote } from '@/lib/sync/push-application';
import { getCached, setCached, isNetworkError } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { networkManager } from '@/lib/network-manager';
import { runOnlineFirstRemote } from '@/lib/online-first-remote';
import {
  APPLICATION_CREATE_MAX_ATTEMPTS,
  retryNetworkOperation,
} from '@/lib/network-retry';
import { randomPassword } from '@/lib/random-password';
import type { LoanApplicationRow, ClientRow } from './types';
import type {
  GroupClientLeaderCustomCreate,
  GroupClientLeaderPatch,
  GroupClientLeaderResponse,
  GroupClientLeaderSlotUpsert,
  GroupLoanAggregateResponse,
  GroupMemberCreateInput,
} from './group-loan-types';
export type { ApiCollateralLoanLockSummary } from './accounts-api';

export { USE_API } from '@/lib/config-flags';
import { USE_API } from '@/lib/config-flags';

/** When false, use API; when true, SQLite only (no sync) */
function useLocalStorage(): boolean {
  return !USE_API;
}

async function getToken(): Promise<string> {
  return getAuthToken();
}

async function isOnline(): Promise<boolean> {
  return networkManager.getIsOnline();
}

/** Group loan staff flows require live API (validate-group, allocation). */
function generateClientCredentials(): { clientId: string; password: string } {
  const clientId = `COFI-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { clientId, password: randomPassword(12) };
}

function makeLocalClientId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Id returned for a collateral/guarantor record that is queued on the device.
 * Negative so it can never collide with a server id; screens reload from the
 * queue rather than using it directly.
 */
export const QUEUED_OFFLINE_ID = -1;

/**
 * Unique queue key per attachment. The queue de-duplicates on
 * operation + entity id, so reusing the application id would make a second
 * collateral or guarantor overwrite the first while offline.
 */
function attachmentQueueKey(applicationId: number | string): string {
  return `${applicationId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function resolveClientRemoteIdForApi(clientRef: string | number): Promise<number> {
  const ref = String(clientRef);
  if (ref.startsWith('local-')) {
    const row = await sqlite.sqliteGetClient(ref);
    if (row?.remote_id != null) return row.remote_id;
    throw new Error('Client not yet synced. Connect and sync before continuing.');
  }
  const numeric = parseInt(ref, 10);
  if (!Number.isNaN(numeric)) {
    const row = await sqlite.sqliteGetClient(ref);
    if (row?.remote_id != null) return row.remote_id;
    return numeric;
  }
  throw new Error('Invalid client reference');
}

function hasNonEmptyGroupAllocation(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

// ─── Applications ─────────────────────────────────────────────────────────

export async function getApplications(
  clientId?: string, 
  clientName?: string,
  branchId?: number,
  officerId?: number,
  supervisedOnly?: boolean,
  creditBook?: string,
  isAgricultural?: boolean
): Promise<LoanApplicationRow[]> {
  if (useLocalStorage()) {
    return sqlite.sqliteGetApplications(clientId, clientName);
  }
  const local = await sqlite.sqliteGetApplications(clientId, clientName);
  if (await isOnline()) {
    try {
      const token = await getToken();
      const remote = await api.apiGetApplications(token, { clientId, clientName, branchId, officerId, supervisedOnly, creditBook, isAgricultural });
      const remoteIds = new Set(remote.map((r) => r.id));
      // Keep offline-only / in-flight sync rows. Drop local ghosts whose remote
      // is already gone (common for WITHDRAWN / hard-deleted drafts).
      const localPending: LoanApplicationRow[] = [];
      for (const l of local) {
        const rid = (l as { remote_id?: number | null }).remote_id;
        if (!rid) {
          localPending.push(l);
          continue;
        }
        if (remoteIds.has(rid)) continue;
        const sync = String((l as { sync_status?: string }).sync_status ?? '').toLowerCase();
        if (sync === 'pending' || sync === 'failed') {
          localPending.push(l);
          continue;
        }
        try {
          await sqlite.sqliteDeleteApplication(l.id);
        } catch {
          /* ignore prune failures */
        }
      }
      const remoteWithStatus = remote.map((r) => ({ ...r, sync_status: 'synced' as const }));
      return [...remoteWithStatus, ...localPending];
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }
  return local;
}

export async function getBranches(): Promise<api.ApiBranch[]> {
  if (!USE_API) return [];
  const token = await getToken();
  return api.apiGetBranches(token);
}

/**
 * Fetch canonical district names from the backend
 * (`GET /api/v1/districts?is_active=true`). Returns an empty array when
 * the API mode is off or the request fails so callers can fall back to
 * the static `MALAWI_DISTRICT_OPTIONS` list silently.
 */
export async function getCanonicalDistricts(): Promise<string[]> {
  if (!USE_API) return [];
  const { getDistrictsLocal, refreshDistricts } = await import(
    '@/lib/loan-origination/origination-prefetch'
  );
  const local = await getDistrictsLocal();
  if (local.length > 0) {
    void refreshDistricts().catch(() => undefined);
    return local;
  }
  try {
    return await refreshDistricts();
  } catch {
    return [];
  }
}

export type CreateApplicationInput = Omit<LoanApplicationRow, 'id' | 'created_at'> & {
  business_location?: import('./geolocation-types').GeolocationInput;
  group_loan_allocation?: Record<string, unknown>;
  loan_type?: string;
  application_notes?: string;
  loan_product_id?: number;
  selected_repayment_strategy?: string;
  group_parent_client_id?: number;
  declare_mutual_guarantee_pathway?: boolean;
};

export async function createApplication(row: CreateApplicationInput): Promise<LoanApplicationRow> {
  const {
    business_location,
    group_loan_allocation,
    loan_type,
    application_notes,
    loan_product_id,
    selected_repayment_strategy,
    group_parent_client_id,
    declare_mutual_guarantee_pathway,
    ...appRow
  } = row;
  if (hasNonEmptyGroupAllocation(group_loan_allocation) && !USE_API) {
    throw new Error('Group loan applications require API mode (EXPO_PUBLIC_USE_API=true).');
  }
  if (useLocalStorage()) {
    return sqlite.sqliteCreateApplication(appRow);
  }

  const pushPayload = {
    ...appRow,
    business_location,
    group_loan_allocation,
    loan_type,
    application_notes,
    loan_product_id,
    selected_repayment_strategy,
    group_parent_client_id,
    declare_mutual_guarantee_pathway,
    client_reference: appRow.application_number,
  };

  const clientRef = appRow.client_id != null ? String(appRow.client_id) : '';
  const clientNeedsPriorSync = clientRef.startsWith('local-');

  // Device-only client cannot be posted until the client row syncs first.
  if (clientNeedsPriorSync) {
    const created = await sqlite.sqliteCreateApplication(appRow);
    await enqueueSync('CREATE_APPLICATION', 'application', created.id, pushPayload);
    return created;
  }

  // Soft probe (API /health). Even if probe fails, still attempt POST when the
  // OS reports a data link — probe false-negatives must not skip the server.
  await networkManager.forceRefresh();
  const shouldAttemptRemote = await networkManager.hasDataLink();

  if (shouldAttemptRemote) {
    try {
      try {
        await validateAndRefreshSession();
      } catch {
        /* token may still be usable; API will surface auth errors */
      }

      const remote = await retryNetworkOperation(
        async () => {
          const token = await getToken();
          return pushLoanApplicationToRemote(token, pushPayload);
        },
        {
          maxAttempts: APPLICATION_CREATE_MAX_ATTEMPTS,
          label: 'createApplication',
          onAttempt: (attempt, maxAttempts) => {
            logger.info(`createApplication remote attempt ${attempt}/${maxAttempts}`, {
              module: 'data',
            });
          },
        }
      );

      return sqlite.sqliteCacheSyncedApplication({
        ...remote,
        application_number: remote.application_number || appRow.application_number,
        product_name: remote.product_name || appRow.product_name,
        documents_json: appRow.documents_json ?? remote.documents_json,
        group_loan_allocation: group_loan_allocation ?? remote.group_loan_allocation,
        sync_status: 'synced',
        remote_id: remote.id,
      });
    } catch (e) {
      // Validation / auth / business errors must surface — do not pretend offline save.
      if (!isNetworkError(e)) throw e;
      logger.warn(
        `createApplication exhausted remote attempts; falling back to SQLite queue: ${
          e instanceof Error ? e.message : String(e)
        }`,
        { module: 'data' }
      );
      // Network died after retries → fall through to durable offline queue.
    }
  } else {
    logger.info('createApplication: no link connectivity; saving to SQLite queue', {
      module: 'data',
    });
  }

  // Offline (or unreachable after retries): persist locally and enqueue sequential upload.
  const created = await sqlite.sqliteCreateApplication(appRow);
  await enqueueSync('CREATE_APPLICATION', 'application', created.id, pushPayload);

  // If we attempted the server, kick sync once in case the link recovered.
  if (shouldAttemptRemote) {
    try {
      await validateAndRefreshSession();
    } catch {
      /* sync will attempt refresh again */
    }
    await runSyncIfOnline({ forceNetworkCheck: true, retryFailed: true });
  }

  const refreshed = await sqlite.sqliteGetApplication(created.id);
  return refreshed ?? created;
}

export async function getApplication(id: number): Promise<LoanApplicationRow | null> {
  if (useLocalStorage()) {
    return sqlite.sqliteGetApplicationByAnyId(id);
  }
  if (await isOnline()) {
    try {
      const token = await getToken();
      const auth = await getStoredAuth();
      const remote = await api.apiGetApplication(token, id, auth?.user?.role === 'client');
      if (remote) return remote;
    } catch {
      /* fall through to the local row (offline draft or transient API miss) */
    }
  }
  const local = await sqlite.sqliteGetApplicationByAnyId(id);
  if (local) {
    if (!local.group_loan_allocation) {
      const { getPendingApplicationGroupAllocation } = await import('@/lib/sync/sync-service');
      const pendingAllocation = await getPendingApplicationGroupAllocation(id);
      if (pendingAllocation) {
        return { ...local, group_loan_allocation: pendingAllocation };
      }
    }
    return local;
  }
  return null;
}

export async function updateApplication(
  id: number,
  updates: {
    status?: string;
    approved_amount?: number;
    approved_term_months?: number;
    rejection_reason?: string;
    requested_amount?: number;
    requested_term_months?: number;
    purpose?: string;
    product_name?: string;
    loan_product_id?: number;
    loan_type?: string;
    application_notes?: string;
    selected_repayment_strategy?: string;
  }
): Promise<void> {
  const localApp = await sqlite.sqliteGetApplication(id);
  if (useLocalStorage()) {
    if (localApp) await sqlite.sqliteUpdateApplication(id, updates);
    return;
  }

  if (localApp) {
    const remoteId = (localApp as { remote_id?: number })?.remote_id;
    const online = await isOnline();

    if (online) {
      try {
        const token = await getToken();
        if (updates.status === 'APPROVED') {
          await api.apiApproveApplication(token, remoteId ?? id, updates.approved_amount, updates.approved_term_months);
        } else if (updates.status === 'REJECTED') {
          await api.apiRejectApplication(token, remoteId ?? id, updates.rejection_reason);
        } else if (updates.status === 'DISBURSED') {
          await api.apiDisburseApplication(token, remoteId ?? id);
        } else {
          await api.apiUpdateApplication(token, remoteId ?? id, updates);
        }
        await sqlite.sqliteUpdateApplication(id, { ...updates, sync_status: 'synced' });
        return;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
      }
    }

    await sqlite.sqliteUpdateApplication(id, updates);
    await enqueueSync('UPDATE_APPLICATION', 'application', id, {
      ...updates,
      remote_id: remoteId,
      approved_amount: updates.approved_amount,
      approved_term_months: updates.approved_term_months,
    });
    await runSyncIfOnline({ forceNetworkCheck: true });
  } else if (await isOnline()) {
    const token = await getToken();
    if (updates.status === 'APPROVED') {
      await api.apiApproveApplication(token, id, updates.approved_amount, updates.approved_term_months);
    } else if (updates.status === 'REJECTED') {
      await api.apiRejectApplication(token, id, updates.rejection_reason);
    } else if (updates.status === 'DISBURSED') {
      await api.apiDisburseApplication(token, id);
    } else {
      await api.apiUpdateApplication(token, id, updates);
    }
  }
}

export type DraftApplicationEdits = {
  requested_amount?: number;
  requested_term_months?: number;
  purpose?: string;
  product_name?: string;
  loan_product_id?: number;
  loan_type?: string;
  application_notes?: string;
  selected_repayment_strategy?: string;
};

/** Edit a DRAFT application (local pending and/or remote). */
export async function updateDraftApplication(
  id: number,
  edits: DraftApplicationEdits
): Promise<LoanApplicationRow> {
  // List/detail often pass the server id; resolve by local PK or remote_id.
  const local = await sqlite.sqliteGetApplicationByAnyId(id);
  const localPk = local?.id ?? null;
  const remoteId =
    local?.remote_id ??
    (local?.sync_status === 'synced' ? local.id : null) ??
    // No local cache (common for online-fetched drafts) — treat caller id as remote.
    (local == null ? id : null);

  // Loan-product / metadata edits must go through the staff application endpoint
  // (the borrower mobile PATCH schema has no loan_product_id). Everything else stays
  // on the offline-safe mobile draft patch path.
  const hasProductEdits =
    edits.loan_product_id != null ||
    edits.product_name != null ||
    edits.loan_type != null ||
    edits.application_notes != null ||
    edits.selected_repayment_strategy != null;

  const sqliteEdits = {
    requested_amount: edits.requested_amount,
    requested_term_months: edits.requested_term_months,
    purpose: edits.purpose,
    product_name: edits.product_name,
    loan_product_id: edits.loan_product_id,
    loan_type: edits.loan_type,
    application_notes: edits.application_notes,
    selected_repayment_strategy: edits.selected_repayment_strategy,
  };

  if (useLocalStorage()) {
    if (localPk == null) throw new Error('Draft not found');
    await sqlite.sqliteUpdateApplication(localPk, sqliteEdits);
    const refreshed = await sqlite.sqliteGetApplication(localPk);
    if (!refreshed) throw new Error('Draft not found');
    return refreshed;
  }

  const online = await isOnline();

  // Try remote first for synced / server-only drafts.
  if (remoteId != null && online) {
    try {
      const token = await getToken();
      const updated = hasProductEdits
        ? await api.apiUpdateApplication(token, remoteId, edits)
        : await api.apiUpdateMobileLoanApplication(token, remoteId, edits);
      await sqlite.sqliteCacheSyncedApplication({
        ...updated,
        sync_status: 'synced',
        remote_id: updated.id,
      });
      return { ...updated, sync_status: 'synced', remote_id: updated.id };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
    // Network error — fall through to offline path when we have a local row.
  }

  // Update local SQLite.
  if (localPk != null) {
    await sqlite.sqliteUpdateApplication(localPk, sqliteEdits);
  }

  // Already on the server but online attempt failed or offline — queue a draft patch.
  if (remoteId != null && localPk != null) {
    await sqlite.sqliteUpdateApplication(localPk, { sync_status: 'pending' });
    await enqueueSync('UPDATE_APPLICATION', 'application', localPk, {
      remote_id: remoteId,
      _mobile_draft: !hasProductEdits,
      requested_amount: edits.requested_amount,
      requested_term_months: edits.requested_term_months,
      purpose: edits.purpose,
      product_name: edits.product_name,
      loan_product_id: edits.loan_product_id,
      loan_type: edits.loan_type,
      application_notes: edits.application_notes,
      selected_repayment_strategy: edits.selected_repayment_strategy,
    });
    if (online) await runSyncIfOnline({ forceNetworkCheck: true });
    const out = await sqlite.sqliteGetApplication(localPk);
    if (!out) throw new Error('Draft not found');
    return out;
  }

  // Still pending offline create — refresh sync payload so the next push uses new values.
  if (local && localPk != null && (local.sync_status === 'pending' || local.sync_status === 'failed')) {
    const refreshed = await sqlite.sqliteGetApplication(localPk);
    if (refreshed) {
      const { getPendingApplicationGroupAllocation } = await import('@/lib/sync/sync-service');
      const allocation = await getPendingApplicationGroupAllocation(refreshed.id);
      let prior: Record<string, unknown> = {};
      try {
        const { getAppDatabase } = await import('@/lib/data/sqlite');
        const database = await getAppDatabase();
        const row = await database.getFirstAsync<{ payload: string }>(
          `SELECT payload FROM sync_queue
           WHERE operation = 'CREATE_APPLICATION' AND entity_local_id = ?
           ORDER BY id DESC LIMIT 1`,
          String(refreshed.id)
        );
        if (row) prior = JSON.parse(row.payload) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      await enqueueSync('CREATE_APPLICATION', 'application', refreshed.id, {
        ...prior,
        ...refreshed,
        client_reference: refreshed.application_number,
        group_loan_allocation: allocation ?? prior.group_loan_allocation,
      });
    }
  }

  if (localPk != null) {
    const out = await sqlite.sqliteGetApplication(localPk);
    if (out) return out;
  }

  // Online-only draft with no local cache and no successful remote write.
  if (remoteId != null && online) {
    throw new Error('Could not reach the server to save draft changes. Check your connection and try again.');
  }
  throw new Error('Draft not found');
}

function isRemoteAlreadyGone(err: unknown): boolean {
  if (err instanceof ApiClientError && (err.status === 404 || err.status === 400)) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /not found|404|does not exist|already (deleted|removed|withdrawn)/i.test(msg);
}

/**
 * Delete a DRAFT/WITHDRAWN application from the server (when present) and always
 * from local SQLite. Remote-gone (404) is treated as success so offline ghosts
 * can still be cleared when the online system already has no record.
 */
export async function deleteDraftApplication(
  id: number,
  opts?: { status?: string | null }
): Promise<void> {
  const local = await sqlite.sqliteGetApplicationByAnyId(id);
  const status = String(opts?.status ?? local?.status ?? '').toUpperCase();
  const remoteId =
    local?.remote_id ??
    (local && local.sync_status === 'synced' ? local.id : null) ??
    (!local ? id : null);

  if (useLocalStorage()) {
    if (local) await sqlite.sqliteDeleteApplication(local.id);
    else await sqlite.sqliteDeleteApplication(id);
    return;
  }

  const online = await isOnline();
  if (remoteId != null && online) {
    const token = await getToken();
    try {
      await api.apiDeleteMobileLoanApplication(token, remoteId);
    } catch (deleteErr) {
      if (isRemoteAlreadyGone(deleteErr)) {
        // Online already has no record — still purge local below.
      } else {
        const deleteMsg = deleteErr instanceof Error ? deleteErr.message : '';
        const isMethodMissing =
          (deleteErr instanceof ApiClientError && deleteErr.status === 405) ||
          /method not allowed|405/i.test(deleteMsg);

        if (status === 'WITHDRAWN') {
          // Soft-withdrawn remotes are often already hidden online. Queue DELETE
          // for when the API supports it, and always purge local below.
          await enqueueSync('DELETE_APPLICATION', 'application', `remote:${remoteId}`, {
            remote_id: remoteId,
            _mobile_draft: true,
          });
        } else if (/only draft applications can be deleted/i.test(deleteMsg) && !isMethodMissing) {
          throw new Error(deleteMsg || 'Could not delete application on server');
        } else {
          // Production may not have DELETE yet (405) — withdraw soft-deletes a DRAFT.
          try {
            await api.apiWithdrawLoanApplication(token, remoteId);
          } catch (withdrawErr) {
            if (!isRemoteAlreadyGone(withdrawErr)) {
              const msg =
                withdrawErr instanceof Error
                  ? withdrawErr.message
                  : deleteMsg || 'Could not delete draft on server';
              // Never-synced / local-only drafts: allow SQLite purge.
              if (local && !local.remote_id && local.sync_status !== 'synced') {
                /* fall through to SQLite delete */
              } else if (isMethodMissing) {
                await enqueueSync('DELETE_APPLICATION', 'application', `remote:${remoteId}`, {
                  remote_id: remoteId,
                  _mobile_draft: true,
                });
              } else {
                throw new Error(msg);
              }
            }
          }
        }
      }
    }
  } else if (remoteId != null && !online) {
    await enqueueSync('DELETE_APPLICATION', 'application', `remote:${remoteId}`, {
      remote_id: remoteId,
      _mobile_draft: true,
    });
  }

  // Always remove local row(s) so withdrawn offline ghosts cannot linger.
  if (local) {
    await sqlite.sqliteDeleteApplication(local.id);
  } else {
    await sqlite.sqliteDeleteApplication(id);
  }
}

// ─── Clients ───────────────────────────────────────────────────────────────

export async function getClients(branchId?: number): Promise<ClientRow[]> {
  if (useLocalStorage()) {
    return sqlite.sqliteGetClients();
  }
  const cacheKey = 'clients';
  try {
    const token = await getToken();
    let resolvedBranchId = branchId;
    if (resolvedBranchId == null) {
      try {
        const profile = await api.apiGetStaffProfile(token);
        resolvedBranchId = profile?.branch_id;
      } catch {
        // Staff profile may fail for client role; continue without branch_id
      }
    }
    const rows = await api.apiGetClients(token, {
      include_inactive: true,
      sort: 'created_at_desc',
      branch_id: resolvedBranchId,
      limit: 500,
    });
    await sqlite.sqliteUpsertClients(rows);
    await setCached(cacheKey, rows);
    return rows;
  } catch (e) {
    if (isNetworkError(e)) {
      const cached = await getCached<ClientRow[]>(cacheKey);
      if (cached) return cached;
    }
    return sqlite.sqliteGetClients();
  }
}

export type GetClientsPaginatedOpts = {
  page?: number;
  limit?: number;
  search?: string;
  branchId?: number;
  statusFilter?: 'all' | 'verified' | 'unverified' | 'active' | 'inactive' | 'unassigned';
  /** Omit to use API default (true). Set false to include group-linked individuals (e.g. guarantor picker). */
  exclude_group_members?: boolean;
};

export type ClientsPaginatedResult = {
  items: ClientRow[];
  total: number;
  page: number;
  pages: number;
};

export async function getClientsPaginated(
  opts?: GetClientsPaginatedOpts
): Promise<ClientsPaginatedResult> {
  const localAll = await sqlite.sqliteGetClients();
  const limit = opts?.limit ?? 20;
  const page = opts?.page ?? 1;
  const search = opts?.search?.toLowerCase().trim();

  function getLocalResult(all: ClientRow[]): ClientsPaginatedResult {
    let filtered = all;
    if (search) {
      filtered = all.filter(
        (c) =>
          c.name?.toLowerCase().includes(search) ||
          c.phone_number?.includes(opts?.search ?? '') ||
          c.national_id?.includes(opts?.search ?? '') ||
          c.customer_number?.toLowerCase().includes(search) ||
          c.email?.toLowerCase().includes(search)
      );
    }
    if (opts?.statusFilter === 'verified') filtered = filtered.filter((c) => c.is_verified !== false);
    else if (opts?.statusFilter === 'unverified') filtered = filtered.filter((c) => c.is_verified === false);
    else if (opts?.statusFilter === 'active') filtered = filtered.filter((c) => c.is_active !== false);
    else if (opts?.statusFilter === 'inactive') filtered = filtered.filter((c) => c.is_active === false);
    
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    return { items, total, page, pages };
  }

  if (useLocalStorage()) {
    return getLocalResult(localAll);
  }

  if (await isOnline()) {
    try {
      const token = await getToken();
      let resolvedBranchId = opts?.branchId;
      if (resolvedBranchId == null) {
        try {
          const profile = await api.apiGetStaffProfile(token);
          resolvedBranchId = profile?.branch_id;
        } catch { /* continue */ }
      }

      // LO: assigned book; CIO: zone clients; managers/compliance: branch-wide.
      const { resolveStaffClientListScope } = await import('@/lib/staff/client-list-scope');
      let backendRole: string | undefined;
      let hasPermission: ((code: string) => boolean) | undefined;
      try {
        const { useAuthStore } = await import('@/store/auth');
        const authState = useAuthStore.getState();
        backendRole = authState.user?.backendRole;
        hasPermission = authState.hasPermission;
      } catch {
        /* optional */
      }
      if (!backendRole) {
        const auth = await getStoredAuth();
        backendRole =
          (auth?.user as { backendRole?: string } | undefined)?.backendRole ??
          auth?.user?.role;
      }
      const scope = resolveStaffClientListScope(backendRole, hasPermission);
      const verifiedFilter =
        opts?.statusFilter === 'unverified'
          ? false
          : scope.completedOnlyBranchWide && scope.allBranchClients
            ? true
            : undefined;

      const result = scope.cioSupervisedPortfolio
        ? await api.apiGetCioPortfolioClients(token, {
            page: opts?.page ?? 1,
            limit: opts?.limit ?? 20,
            search: opts?.search,
            include_inactive: true,
            include_drafts: opts?.statusFilter !== 'unassigned',
            unassigned_only: opts?.statusFilter === 'unassigned',
          })
        : await api.apiGetClientsPaginated(token, {
            page: opts?.page ?? 1,
            limit: opts?.limit ?? 20,
            search: opts?.search,
            branch_id: resolvedBranchId,
            include_inactive: true,
            sort: 'created_at_desc',
            assigned_to_me: scope.assignedToMe || undefined,
            all_branch_clients: scope.allBranchClients || undefined,
            is_verified: verifiedFilter,
            ...(opts?.exclude_group_members !== undefined && {
              exclude_group_members: opts.exclude_group_members,
            }),
          });

      if (result.items.length > 0) {
        await sqlite.sqliteUpsertClients(result.items);
        const pendingLocal = await sqlite.sqliteGetPendingClients();
        const pendingIds = new Set(pendingLocal.map((c) => c.id));
        const mergedItems = [
          ...pendingLocal,
          ...result.items.filter((c) => !pendingIds.has(c.id)),
        ];
        return { ...result, items: mergedItems, total: result.total + pendingLocal.length };
      }
      // If API returns empty but we have local data, show local data as baseline
      if (localAll.length > 0) {
        return getLocalResult(localAll);
      }
      return result;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }

  return getLocalResult(localAll);
}

export async function verifyClient(clientId: number): Promise<void> {
  if (useLocalStorage()) return;

  const remote = await runOnlineFirstRemote('verifyClient', async () => {
    const token = await getToken();
    const existing =
      (await api.apiGetClient(token, String(clientId))) ??
      (await sqlite.sqliteGetClient(String(clientId)));
    const { verifyStaffClientWithOrgKycGuard } = await import('@/lib/staff/client-kyc-update');
    await verifyStaffClientWithOrgKycGuard(token, String(clientId), {
      name: existing?.name,
      client_type: existing?.client_type,
      group_constitution_uri: existing?.group_constitution_uri,
    });
  });
  if (remote.ok) return;

  await enqueueSync('VERIFY_CLIENT', 'client', clientId, {});
  await runSyncIfOnline({ forceNetworkCheck: true });
}

export async function getClient(id: string): Promise<ClientRow | null> {
  if (useLocalStorage()) {
    return sqlite.sqliteGetClient(id);
  }
  try {
    const token = await getToken();
    return api.apiGetClient(token, id);
  } catch {
    return sqlite.sqliteGetClient(id);
  }
}

export type { LoanProductRow } from '@/lib/loan-products/loan-products-cache';
export {
  getLoanProductsLocal,
  refreshLoanProducts,
  prefetchLoanProductsForCurrentUser,
  getLoanProductsResolved,
} from '@/lib/loan-products/loan-products-cache';

/** Cache-first loan catalog (falls back to network only when local store is empty). */
export async function getLoanProducts(
  audience: 'client' | 'staff' = 'staff'
): Promise<import('@/lib/loan-products/loan-products-cache').LoanProductRow[]> {
  if (useLocalStorage()) return [];
  const { getLoanProductsResolved } = await import('@/lib/loan-products/loan-products-cache');
  return getLoanProductsResolved(audience);
}

/** API create may omit id (server assigns); SQLite demo requires id + customer_number. */
export type CreateClientInput = Partial<Omit<ClientRow, 'created_at' | 'updated_at'>> & {
  name: string;
  client_type?: 'INDIVIDUAL' | 'SME' | 'COOPERATIVE' | 'GROUP';
  business_location?: import('./geolocation-types').GeolocationInput;
};

export type CreateClientWithKycInput = CreateClientInput & {
  district_id?: number;
  kyc?: import('@/lib/client-portal/kyc-completion-calculator').ClientKYCData;
  localPreviews?: Partial<
    Record<import('@/lib/client-portal/api').KycUploadField, string>
  >;
  saveMode: 'draft' | 'finished';
};

export async function createClientWithKyc(input: CreateClientWithKycInput): Promise<ClientRow> {
  const kyc = input.kyc ?? {};
  const row = await createClient({
    name: input.name.trim(),
    phone_number: input.phone_number?.trim() ?? kyc.phone_number?.trim(),
    national_id: input.national_id?.trim() ?? kyc.national_id?.trim(),
    email: input.email?.trim() ?? kyc.email?.trim(),
    address: input.address?.trim() ?? kyc.address?.trim(),
    client_type: input.client_type,
    business_location: input.business_location,
  });

  if (useLocalStorage()) return row;

  const hasKycPayload =
    input.saveMode === 'finished' ||
    Object.keys(kyc).length > 0 ||
    (input.localPreviews && Object.keys(input.localPreviews).length > 0) ||
    input.district_id != null;

  if (!hasKycPayload) return row;

  const remote = await runOnlineFirstRemote('createClientWithKyc', async () => {
    const token = await getToken();
    const { applyStaffClientKycUpdate } = await import('@/lib/staff/client-kyc-update');
    await applyStaffClientKycUpdate(
      token,
      row.id,
      { ...kyc, client_type: input.client_type ?? row.client_type },
      input.localPreviews ?? {},
      {
        saveMode: input.saveMode,
        districtId: input.district_id,
        clientType: input.client_type ?? row.client_type ?? 'INDIVIDUAL',
        fullName: input.name.trim(),
      }
    );
    return api.apiGetClient(token, row.id);
  });

  if (remote.ok) {
    await sqlite.sqliteUpsertClients([{ ...remote.value, sync_status: 'synced' }]);
    return remote.value;
  }

  await enqueueSync('UPDATE_CLIENT_KYC', 'client', row.id, {
    kyc,
    local_previews: input.localPreviews ?? {},
    save_mode: input.saveMode,
    district_id: input.district_id,
    client_type: input.client_type ?? row.client_type ?? 'INDIVIDUAL',
    full_name: input.name.trim(),
  });
  await runSyncIfOnline({ forceNetworkCheck: true });
  return row;
}

export async function createClient(row: CreateClientInput): Promise<ClientRow> {
  if (useLocalStorage()) {
    if (!row.id) throw new Error('Client id required when using local storage only');
    return sqlite.sqliteCreateClient(row as Omit<ClientRow, 'created_at' | 'updated_at'>);
  }

  const { clientId, password } = generateClientCredentials();
  const localId = makeLocalClientId();
  const baseRow: Omit<ClientRow, 'created_at' | 'updated_at'> = {
    id: localId,
    name: row.name.trim(),
    phone_number: row.phone_number?.trim(),
    national_id: row.national_id?.trim(),
    email: row.email?.trim(),
    address: row.address?.trim(),
    client_type: row.client_type ?? 'INDIVIDUAL',
    customer_number: clientId,
    sync_status: 'pending',
    is_verified: false,
    is_active: true,
  };

  const remote = await runOnlineFirstRemote('createClient', async () => {
    const token = await getToken();
    return api.apiCreateClient(token, {
      name: row.name,
      phone_number: row.phone_number,
      national_id: row.national_id,
      address: row.address,
      email: row.email,
      client_type: row.client_type,
      business_location: row.business_location,
    });
  });
  if (remote.ok) {
    await sqlite.sqliteUpsertClients([{ ...remote.value, sync_status: 'synced' }]);
    return remote.value;
  }

  const created = await sqlite.sqliteCreateClient(baseRow);
  await enqueueSync('CREATE_CLIENT', 'client', localId, {
    name: row.name.trim(),
    phone_number: row.phone_number,
    national_id: row.national_id,
    email: row.email,
    address: row.address,
    client_type: row.client_type ?? 'INDIVIDUAL',
    client_id: clientId,
    password,
    business_location: row.business_location,
  });
  await runSyncIfOnline({ forceNetworkCheck: true });
  return created;
}

export async function removeGroupMember(groupClientId: number, memberClientId: number): Promise<void> {
  if (useLocalStorage()) throw new Error('Removing group members requires API');
  const token = await getToken();
  await api.apiRemoveGroupMember(token, groupClientId, memberClientId);
}

export async function getGroupMembers(groupClientId: number): Promise<ClientRow[]> {
  if (useLocalStorage()) return [];
  try {
    const token = await getToken();
    const members = await api.apiGetGroupMembers(token, groupClientId);
    // Cache the roster: group loan origination needs it, and officers often
    // reach the village after losing signal.
    await sqlite.sqliteCacheGroupMembers(groupClientId, members).catch(() => undefined);
    return members;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const cached = await sqlite.sqliteGetGroupMembers(groupClientId).catch(() => []);
    return cached;
  }
}

export async function addGroupMember(
  groupClientId: number,
  body: GroupMemberCreateInput
): Promise<ClientRow> {
  if (useLocalStorage()) throw new Error('Adding group members requires API');

  const localId = makeLocalClientId();
  const localRow: Omit<ClientRow, 'created_at' | 'updated_at'> = {
    id: localId,
    name: body.full_name.trim(),
    phone_number: body.phone_number ?? undefined,
    national_id: body.national_id ?? undefined,
    email: body.email ?? undefined,
    address: body.address ?? undefined,
    customer_number: body.client_id,
    client_type: 'INDIVIDUAL',
    parent_client_id: String(groupClientId),
    sync_status: 'pending',
    is_verified: false,
    is_active: true,
  };

  const remote = await runOnlineFirstRemote('addGroupMember', async () => {
    const token = await getToken();
    const resolvedGroupId = await resolveClientRemoteIdForApi(groupClientId);
    return api.apiAddGroupMember(token, resolvedGroupId, body);
  });
  if (remote.ok) {
    await sqlite.sqliteUpsertClients([{ ...remote.value, sync_status: 'synced' }]);
    return remote.value;
  }

  const created = await sqlite.sqliteCreateClient(localRow);
  await enqueueSync('CREATE_GROUP_MEMBER', 'group_member', localId, {
    group_parent_id: String(groupClientId),
    member: body,
  });
  await runSyncIfOnline({ forceNetworkCheck: true });
  return created;
}

export async function getGroupLeaders(groupClientId: number): Promise<GroupClientLeaderResponse[]> {
  if (useLocalStorage()) return [];
  const token = await getToken();
  return api.apiGetGroupLeaders(token, groupClientId);
}

export async function upsertGroupLeaderSlot(
  groupClientId: number,
  body: GroupClientLeaderSlotUpsert
): Promise<GroupClientLeaderResponse> {
  if (useLocalStorage()) throw new Error('Leader updates require API');
  const token = await getToken();
  return api.apiUpsertGroupLeaderSlot(token, groupClientId, body);
}

export async function createCustomGroupLeader(
  groupClientId: number,
  body: GroupClientLeaderCustomCreate
): Promise<GroupClientLeaderResponse> {
  if (useLocalStorage()) throw new Error('Leader updates require API');
  const token = await getToken();
  return api.apiCreateCustomGroupLeader(token, groupClientId, body);
}

export async function patchGroupLeader(
  groupClientId: number,
  leaderId: number,
  body: GroupClientLeaderPatch
): Promise<GroupClientLeaderResponse> {
  if (useLocalStorage()) throw new Error('Leader updates require API');
  const token = await getToken();
  return api.apiPatchGroupLeader(token, groupClientId, leaderId, body);
}

export async function deleteGroupLeader(groupClientId: number, leaderId: number): Promise<void> {
  if (useLocalStorage()) return;
  const token = await getToken();
  await api.apiDeleteGroupLeader(token, groupClientId, leaderId);
}

export async function getGroupLoanAggregate(groupClientId: number): Promise<GroupLoanAggregateResponse> {
  if (useLocalStorage()) {
    return {
      group_client_id: groupClientId,
      member_count: 0,
      member_loans: { loan_count: 0, principal_total_minor: 0, outstanding_principal_minor: 0, total_repaid_minor: 0 },
      group_direct_loans: { loan_count: 0, principal_total_minor: 0, outstanding_principal_minor: 0, total_repaid_minor: 0 },
      combined: { loan_count: 0, principal_total_minor: 0, outstanding_principal_minor: 0, total_repaid_minor: 0 },
    };
  }
  const token = await getToken();
  return api.apiGetGroupLoanAggregate(token, groupClientId);
}

export async function updateClient(
  id: string,
  updates: Partial<Pick<ClientRow, 'name' | 'phone_number' | 'national_id' | 'email' | 'address' | 'occupation' | 'monthly_income' | 'photo_uri' | 'id_document_uri'>>
): Promise<void> {
  if (useLocalStorage()) {
    return sqlite.sqliteUpdateClient(id, updates);
  }

  const remote = await runOnlineFirstRemote('updateClient', async () => {
    const token = await getToken();
    await api.apiUpdateClient(token, id, updates);
  });

  // Mirror the edit locally either way so the profile screen reflects it at once.
  await sqlite.sqliteUpdateClient(id, updates).catch(() => undefined);

  if (remote.ok) {
    await sqlite.sqliteUpdateClientSync(id, { sync_status: 'synced' }).catch(() => undefined);
    return;
  }

  // Offline: keep the officer's edits on the device and replay them on reconnect.
  await sqlite.sqliteUpdateClientSync(id, { sync_status: 'pending' }).catch(() => undefined);

  const local = await sqlite.sqliteGetClient(id);
  const stillPendingCreate = !local?.remote_id && String(id).startsWith('local-');

  if (stillPendingCreate) {
    // The client has not reached the server yet — fold the edits into the
    // queued creation instead of queuing an update against an id that does
    // not exist remotely.
    const prior = await readQueuedPayload('CREATE_CLIENT', id);
    if (prior) {
      await enqueueSync('CREATE_CLIENT', 'client', id, { ...prior, ...updates });
    }
  } else {
    await enqueueSync('UPDATE_CLIENT', 'client', id, { updates });
  }

  await runSyncIfOnline({ forceNetworkCheck: true });
}

export async function addApplicationCollateral(
  applicationId: number,
  collateral: {
    collateral_type: string;
    description: string;
    estimated_value: number;
    registration_number?: string;
    other_type_label?: string;
    guarantee_property?: string;
    pledgor_client_id?: number;
    pledgor_client_ids?: number[];
    geolocation?: import('./geolocation-types').GeolocationInput;
    documents?: Array<{ uri: string; name: string; docType: string }>;
  }
): Promise<{ id: number }> {
  const { documents, geolocation, ...rest } = collateral;

  const remote = await runOnlineFirstRemote('addApplicationCollateral', async () => {
    const token = await getToken();
    let documentKeys: Array<{ key: string; file_name: string; doc_type: string }> | undefined;
    if (documents && documents.length > 0) {
      const { uploadCollateralDocument } = await import('./mediaService');
      documentKeys = await Promise.all(
        documents.map(async (d) => {
          const res = await uploadCollateralDocument(d.uri, token, {
            fileName: d.name,
            docType: d.docType,
          });
          return { key: res.key, file_name: d.name, doc_type: d.docType };
        })
      );
    }
    const created = await api.apiAddApplicationCollateral(token, applicationId, {
      ...rest,
      document_keys: documentKeys,
    });
    if (geolocation && created?.id) {
      await api.apiSetApplicationCollateralLocation(token, applicationId, created.id, geolocation);
    }
    return created;
  });

  if (remote.ok) return remote.value;

  await enqueueSync(
    'ADD_APPLICATION_COLLATERAL',
    'application',
    attachmentQueueKey(applicationId),
    { application_ref: applicationId, audience: 'staff', collateral: rest, documents, geolocation }
  );
  await runSyncIfOnline({ forceNetworkCheck: true });
  return { id: QUEUED_OFFLINE_ID };
}

export async function getOriginationStatus(applicationId: number): Promise<api.OriginationStatus | null> {
  if (useLocalStorage()) return null;
  const token = await getToken();
  return api.apiGetOriginationStatus(token, applicationId);
}

export async function validateGroupOrigination(
  body: import('./group-loan-types').GroupOriginationValidateRequest
): Promise<import('./group-loan-types').GroupOriginationValidateResponse> {
  if (useLocalStorage()) throw new Error('Group origination validation requires API');
  const token = await getToken();
  return api.apiValidateGroupOrigination(token, body);
}

export async function submitApplicationForApproval(applicationId: number): Promise<LoanApplicationRow> {
  if (useLocalStorage()) throw new Error('Submit for approval requires API');

  const remote = await runOnlineFirstRemote('submitApplicationForApproval', async () => {
    const token = await getToken();
    return api.appToRow(await api.apiSubmitApplicationForApproval(token, applicationId));
  });
  if (remote.ok) return remote.value;

  const queued = await queueApplicationAction(applicationId, 'submit_for_approval', 'SUBMITTED');
  if (queued) return queued;
  throw new Error(
    'Saved on this device. The submission will complete automatically when you are back online.'
  );
}

/**
 * Record a submit/withdraw that could not reach the server. The local row moves
 * to its expected status so the officer sees the outcome, and the action is
 * replayed once the application itself has uploaded.
 */
async function queueApplicationAction(
  applicationId: number,
  action: 'submit_for_approval' | 'submit_to_loan_officer' | 'withdraw',
  optimisticStatus: string
): Promise<LoanApplicationRow | null> {
  const local = await sqlite.sqliteGetApplicationByAnyId(applicationId);
  if (local) {
    await sqlite.sqliteUpdateApplication(local.id, {
      status: optimisticStatus,
      sync_status: 'pending',
    });
  }
  await enqueueSync('APPLICATION_ACTION', 'application', `${applicationId}:${action}`, {
    application_ref: local?.id ?? applicationId,
    action,
  });
  await runSyncIfOnline({ forceNetworkCheck: true });

  const refreshed = local ? await sqlite.sqliteGetApplication(local.id) : null;
  if (refreshed) return refreshed;

  // Server-only application with nothing cached locally: the action is queued,
  // but there is no row to hand back for the caller to render.
  return null;
}

export async function postOriginationTransition(
  applicationId: number,
  body: api.LoanOriginationTransitionBody
): Promise<LoanApplicationRow> {
  if (useLocalStorage()) throw new Error('Origination transition requires API');
  const token = await getToken();
  const res = await api.apiPostOriginationTransition(token, applicationId, body);
  return api.appToRow(res);
}

/** Client JWT only – group parent / chair provisioning member portal logins. */
export async function getMobileClientSession(): Promise<api.MobileClientSessionContext | null> {
  if (useLocalStorage()) return null;
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') return null;
  try {
    const token = await getToken();
    return await api.apiGetMobileSession(token);
  } catch {
    return null;
  }
}

export async function listMobileGroupMembersForCredentials(): Promise<api.MobileGroupMemberCredentialsItem[]> {
  if (useLocalStorage()) return [];
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') return [];
  try {
    const token = await getToken();
    const rows = await api.apiGetMobileGroupMembersCredentials(token);
    if (rows.length > 0) {
      const { writeGroupMembersLocal } = await import('@/lib/loan-origination/origination-prefetch');
      await writeGroupMembersLocal(rows);
    }
    return rows;
  } catch {
    // Prefer cached roster when the network call fails (offline / flaky).
    const { getGroupMembersLocal } = await import('@/lib/loan-origination/origination-prefetch');
    return getGroupMembersLocal();
  }
}

/** Group roster listing (same endpoint; requires roster/credential permission). */
export async function listMobileGroupMembers(): Promise<api.MobileGroupMemberCredentialsItem[]> {
  return listMobileGroupMembersForCredentials();
}

export async function getMobileGroupMemberProfile(
  memberId: number
): Promise<api.MobileGroupMemberProfile> {
  if (useLocalStorage()) throw new Error('Member profile requires API');
  const token = await getToken();
  return api.apiGetMobileGroupMemberProfile(token, memberId);
}

export async function getMobileGroupMemberLoans(
  memberId: number
): Promise<api.MobileLoanSummary[]> {
  if (useLocalStorage()) return [];
  const token = await getToken();
  const rows = await api.apiGetMobileGroupMemberLoans(token, memberId);
  return Array.isArray(rows) ? rows : [];
}

export async function getMobileLoanRepaymentSchedule(
  loanId: number
): Promise<api.MobileRepaymentScheduleItem[]> {
  if (useLocalStorage()) return [];
  try {
    const token = await getToken();
    return await api.apiGetMobileLoanRepaymentSchedule(token, loanId);
  } catch {
    return [];
  }
}

export async function updateMobileGroupMemberCredentials(
  memberClientId: number,
  body: { email?: string; password?: string }
): Promise<api.MobileGroupMemberCredentialsItem> {
  if (useLocalStorage()) throw new Error('Member credentials require API');
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') throw new Error('Client session required');
  const token = await getToken();
  return api.apiPutMobileGroupMemberCredentials(token, memberClientId, body);
}

export async function getMobileProposedMemberClientId(): Promise<string> {
  if (useLocalStorage()) return `CLI-LOCAL-${Date.now().toString(36).toUpperCase()}`;
  const token = await getToken();
  return api.apiGetMobileProposedMemberClientId(token);
}

export async function createMobileGroupMember(
  body: api.MobileGroupMemberPortalCreate
): Promise<api.MobileGroupMemberProfile> {
  if (useLocalStorage()) throw new Error('Adding group members requires API');
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') throw new Error('Client session required');
  const token = await getToken();
  return api.apiCreateMobileGroupMember(token, body);
}

export async function patchMobileGroupMember(
  memberClientId: number,
  body: api.MobileGroupMemberPortalUpdate
): Promise<api.MobileGroupMemberProfile> {
  if (useLocalStorage()) throw new Error('Updating group members requires API');
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') throw new Error('Client session required');
  const token = await getToken();
  return api.apiPatchMobileGroupMember(token, memberClientId, body);
}

export async function getMobileGroupLeaders(): Promise<GroupClientLeaderResponse[]> {
  if (useLocalStorage()) return [];
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') return [];
  try {
    const token = await getToken();
    return await api.apiGetMobileGroupLeaders(token);
  } catch {
    return [];
  }
}

export async function upsertMobileGroupLeaderSlot(
  body: GroupClientLeaderSlotUpsert
): Promise<GroupClientLeaderResponse> {
  if (useLocalStorage()) throw new Error('Group leaders require API');
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') throw new Error('Client session required');
  const token = await getToken();
  return api.apiUpsertMobileGroupLeaderSlot(token, body);
}

export async function createMobileCustomGroupLeader(
  body: GroupClientLeaderCustomCreate
): Promise<GroupClientLeaderResponse> {
  if (useLocalStorage()) throw new Error('Group leaders require API');
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') throw new Error('Client session required');
  const token = await getToken();
  return api.apiCreateMobileCustomGroupLeader(token, body);
}

export async function patchMobileGroupLeader(
  leaderId: number,
  body: GroupClientLeaderPatch
): Promise<GroupClientLeaderResponse> {
  if (useLocalStorage()) throw new Error('Group leaders require API');
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') throw new Error('Client session required');
  const token = await getToken();
  return api.apiPatchMobileGroupLeader(token, leaderId, body);
}

export async function deleteMobileGroupLeader(leaderId: number): Promise<void> {
  if (useLocalStorage()) return;
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') return;
  const token = await getToken();
  await api.apiDeleteMobileGroupLeader(token, leaderId);
}

export async function getMobileApplicationWorkflow(
  applicationId: number
): Promise<api.MobileApplicationWorkflowResponse | null> {
  if (useLocalStorage()) return null;
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') return null;
  try {
    const token = await getToken();
    return await api.apiGetMobileApplicationWorkflow(token, applicationId);
  } catch {
    return null;
  }
}

export async function getBorrowerOriginationReadiness(
  applicationId: number
): Promise<api.OriginationStatus | null> {
  if (useLocalStorage()) return null;
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') return null;
  try {
    const token = await getToken();
    return await api.apiGetBorrowerOriginationReadiness(token, applicationId);
  } catch {
    return null;
  }
}

export async function submitApplicationToLoanOfficer(
  applicationId: number
): Promise<LoanApplicationRow | null> {
  if (useLocalStorage()) throw new Error('Submit to loan officer requires API');
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') throw new Error('Client session required');

  const remote = await runOnlineFirstRemote('submitApplicationToLoanOfficer', async () => {
    const token = await getToken();
    return api.appToRow(await api.apiSubmitApplicationToLoanOfficer(token, applicationId));
  });
  if (remote.ok) return remote.value;

  return queueApplicationAction(applicationId, 'submit_to_loan_officer', 'SUBMITTED');
}

export async function withdrawLoanApplication(
  applicationId: number
): Promise<LoanApplicationRow | null> {
  if (useLocalStorage()) throw new Error('Withdraw requires API');
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') throw new Error('Client session required');

  const remote = await runOnlineFirstRemote('withdrawLoanApplication', async () => {
    const token = await getToken();
    return api.appToRow(await api.apiWithdrawLoanApplication(token, applicationId));
  });

  if (remote.ok) {
    const local = await sqlite.sqliteGetApplicationByAnyId(applicationId);
    if (local) {
      await sqlite.sqliteUpdateApplication(local.id, {
        status: remote.value.status ?? 'WITHDRAWN',
      });
    }
    return remote.value;
  }

  return queueApplicationAction(applicationId, 'withdraw', 'WITHDRAWN');
}

export async function getApplicationReturnBlockers(
  applicationId: number
): Promise<api.MobileReturnBlockersPayload | null> {
  if (useLocalStorage()) return null;
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') return null;
  try {
    const token = await getToken();
    return await api.apiGetReturnBlockers(token, applicationId);
  } catch {
    return null;
  }
}

export async function updateApplicationReturnBlocker(
  applicationId: number,
  blockerId: string,
  met: boolean
): Promise<api.MobileReturnBlockersPayload | null> {
  if (useLocalStorage()) return null;
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') throw new Error('Client session required');
  const token = await getToken();
  return api.apiUpdateReturnBlocker(token, applicationId, blockerId, met);
}

async function requireClientToken(): Promise<string> {
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') throw new Error('Client session required');
  return getToken();
}

async function uploadBorrowerCollateralDocuments(
  documents: Array<{ uri: string; name: string; docType: string }>,
  token: string
): Promise<Array<{ key: string; file_name: string; doc_type: string }>> {
  const { uploadCollateralDocument } = await import('./mediaService');
  return Promise.all(
    documents.map(async (d) => {
      const res = await uploadCollateralDocument(d.uri, token, {
        fileName: d.name,
        docType: d.docType,
        audience: 'client',
      });
      return { key: res.key, file_name: d.name, doc_type: d.docType };
    })
  );
}

export async function getBorrowerApplicationCollateral(applicationId: number): Promise<api.ApiCollateral[]> {
  if (useLocalStorage()) return [];
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') return [];
  try {
    const token = await requireClientToken();
    return await api.apiGetBorrowerApplicationCollateral(token, applicationId);
  } catch {
    return [];
  }
}

export async function addBorrowerApplicationCollateral(
  applicationId: number,
  collateral: {
    collateral_type: string;
    description: string;
    estimated_value: number;
    registration_number?: string;
    other_type_label?: string;
    pledgor_client_id?: number;
    pledgor_client_ids?: number[];
    geolocation?: import('./geolocation-types').GeolocationInput;
    documents?: Array<{ uri: string; name: string; docType: string }>;
  }
): Promise<api.ApiCollateral> {
  if (useLocalStorage()) throw new Error('Collateral requires API');
  const { documents, geolocation, ...rest } = collateral;

  const remote = await runOnlineFirstRemote('addBorrowerApplicationCollateral', async () => {
    const token = await requireClientToken();
    let documentKeys: Array<{ key: string; file_name: string; doc_type: string }> | undefined;
    if (documents?.length) {
      documentKeys = await uploadBorrowerCollateralDocuments(documents, token);
    }
    const created = await api.apiAddBorrowerApplicationCollateral(token, applicationId, {
      ...rest,
      document_keys: documentKeys,
    });
    if (geolocation && created?.id) {
      try {
        await api.apiUpdateBorrowerApplicationCollateral(token, applicationId, created.id, {
          geolocation,
        });
      } catch {
        // Create already succeeded; location can be tagged later from the card.
      }
    }
    return created;
  });

  if (remote.ok) return remote.value;

  await enqueueSync(
    'ADD_APPLICATION_COLLATERAL',
    'application',
    attachmentQueueKey(applicationId),
    { application_ref: applicationId, audience: 'client', collateral: rest, documents, geolocation }
  );
  await runSyncIfOnline({ forceNetworkCheck: true });
  return { id: QUEUED_OFFLINE_ID, ...rest } as unknown as api.ApiCollateral;
}

export async function setBorrowerApplicationCollateralLocation(
  applicationId: number,
  collateralId: number,
  location: import('./geolocation-types').GeolocationInput
): Promise<api.ApiCollateral> {
  if (useLocalStorage()) throw new Error('Collateral location requires API');
  const token = await requireClientToken();
  return api.apiUpdateBorrowerApplicationCollateral(token, applicationId, collateralId, {
    geolocation: location,
  });
}

export async function getBorrowerApplicationCollateralSummary(
  applicationId: number
): Promise<api.CollateralSummary | null> {
  if (useLocalStorage()) return null;
  try {
    const token = await requireClientToken();
    return await api.apiGetBorrowerApplicationCollateralSummary(token, applicationId);
  } catch {
    return null;
  }
}

export async function patchBorrowerApplicationCollateralBatch(
  applicationId: number,
  items: Array<{ collateral_id: number; update: Record<string, unknown> }>
): Promise<api.ApiCollateral[]> {
  if (useLocalStorage()) throw new Error('Collateral batch update requires API');
  const token = await requireClientToken();
  return api.apiPatchBorrowerApplicationCollateralBatch(token, applicationId, items);
}

export async function getBorrowerApplicationDocuments(
  applicationId: number
): Promise<api.BorrowerApplicationDocument[]> {
  if (useLocalStorage()) return [];
  try {
    const token = await requireClientToken();
    return await api.apiGetBorrowerApplicationDocuments(token, applicationId);
  } catch {
    return [];
  }
}

export async function addBorrowerApplicationDocument(
  applicationId: number,
  doc: { uri: string; name: string; docType: string; mimeType?: string }
): Promise<void> {
  if (useLocalStorage()) throw new Error('Document upload requires API');
  const token = await requireClientToken();
  await api.apiAddApplicationDocumentClient(token, applicationId, doc);
}

export async function updateBorrowerApplicationDocument(
  applicationId: number,
  documentId: number,
  doc: { uri: string; name: string; docType: string; mimeType?: string }
): Promise<void> {
  if (useLocalStorage()) throw new Error('Document update requires API');
  const token = await requireClientToken();
  await api.apiUpdateApplicationDocumentClient(token, applicationId, documentId, doc);
}

export async function deleteBorrowerApplicationDocument(
  applicationId: number,
  documentId: number
): Promise<void> {
  if (useLocalStorage()) throw new Error('Document delete requires API');
  const token = await requireClientToken();
  await api.apiDeleteApplicationDocumentClient(token, applicationId, documentId);
}

export async function getStaffApplicationDocuments(
  applicationId: number
): Promise<api.StaffApplicationDocument[]> {
  if (useLocalStorage()) return [];
  try {
    const token = await getToken();
    return await api.apiGetStaffApplicationDocuments(token, applicationId);
  } catch {
    return [];
  }
}

export async function addStaffApplicationDocument(
  applicationId: number,
  doc: { uri: string; name: string; docType: string; mimeType?: string; fileName?: string }
): Promise<void> {
  if (useLocalStorage()) throw new Error('Document upload requires API');
  const token = await getToken();
  const auth = await getStoredAuth();
  const staffId = auth?.user?.id;
  if (staffId == null || !Number.isFinite(Number(staffId))) {
    throw new Error('Staff session required to upload documents');
  }
  await api.apiAddApplicationDocumentStaff(token, applicationId, doc, Number(staffId));
}

export async function updateStaffApplicationDocument(
  applicationId: number,
  documentId: number,
  doc: { uri: string; name: string; docType: string; mimeType?: string; fileName?: string }
): Promise<void> {
  if (useLocalStorage()) throw new Error('Document update requires API');
  const token = await getToken();
  await api.apiUpdateApplicationDocumentStaff(token, applicationId, documentId, doc);
}

export async function deleteStaffApplicationDocument(
  applicationId: number,
  documentId: number
): Promise<void> {
  if (useLocalStorage()) throw new Error('Document delete requires API');
  const token = await getToken();
  await api.apiDeleteApplicationDocumentStaff(token, applicationId, documentId);
}

export async function getCustomerDocuments(): Promise<api.CustomerPortalDocument[]> {
  if (useLocalStorage()) return [];
  try {
    const token = await requireClientToken();
    return await api.apiGetCustomerDocuments(token);
  } catch {
    return [];
  }
}

export async function uploadCustomerDocument(doc: {
  document_type: string;
  file_name: string;
  uri: string;
  mime_type?: string;
  client_upload_notes?: string | null;
}): Promise<api.CustomerPortalDocument> {
  if (useLocalStorage()) throw new Error('Document upload requires API');
  const token = await requireClientToken();
  return api.apiUploadCustomerDocument(token, doc);
}

export async function getBorrowerCollateralVault(): Promise<api.ApiCollateral[]> {
  if (useLocalStorage()) return [];
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') return [];
  try {
    const token = await requireClientToken();
    return await api.apiGetBorrowerCollateralVault(token);
  } catch {
    return [];
  }
}

export async function addBorrowerCollateralVaultItem(
  data: {
    collateral_type: string;
    description: string;
    estimated_value: number;
    other_type_label?: string;
    registration_number?: string;
    geolocation?: import('./geolocation-types').GeolocationInput;
    documents?: Array<{ uri: string; name: string; docType: string }>;
  }
): Promise<api.ApiCollateral> {
  if (useLocalStorage()) throw new Error('Collateral vault requires API');
  const token = await requireClientToken();
  let documentKeys: Array<{ key: string; file_name: string; doc_type: string }> | undefined;
  if (data.documents?.length) {
    documentKeys = await uploadBorrowerCollateralDocuments(data.documents, token);
  }
  const { documents: _docs, ...rest } = data;
  const created = await api.apiAddBorrowerCollateralVaultItem(token, {
    ...rest,
    document_keys: documentKeys,
  });
  if (data.geolocation && created?.id) {
    await api.apiSetBorrowerVaultCollateralLocation(token, created.id, data.geolocation);
  }
  return created;
}

export async function setBorrowerVaultCollateralLocation(
  collateralId: number,
  location: import('./geolocation-types').GeolocationInput
): Promise<import('./geolocation-types').GeolocationResponse> {
  if (useLocalStorage()) throw new Error('Collateral location requires API');
  const token = await requireClientToken();
  return api.apiSetBorrowerVaultCollateralLocation(token, collateralId, location);
}

export async function getBorrowerApplicationGuarantors(
  applicationId: number
): Promise<api.ApiGuarantor[]> {
  if (useLocalStorage()) return [];
  const auth = await getStoredAuth();
  if (auth?.user?.role !== 'client') return [];
  try {
    const token = await requireClientToken();
    return await api.apiGetBorrowerApplicationGuarantors(token, applicationId);
  } catch {
    return [];
  }
}

export async function addBorrowerApplicationGuarantor(
  applicationId: number,
  guarantor: api.BorrowerGuarantorInput
): Promise<api.ApiGuarantor> {
  if (useLocalStorage()) throw new Error('Add guarantor requires API');

  const remote = await runOnlineFirstRemote('addBorrowerApplicationGuarantor', async () => {
    const token = await requireClientToken();
    return api.apiAddBorrowerApplicationGuarantor(token, applicationId, guarantor);
  });
  if (remote.ok) return remote.value;

  await enqueueSync(
    'ADD_APPLICATION_GUARANTOR',
    'application',
    attachmentQueueKey(applicationId),
    { application_ref: applicationId, audience: 'client', guarantor }
  );
  await runSyncIfOnline({ forceNetworkCheck: true });
  return { id: QUEUED_OFFLINE_ID, ...guarantor } as unknown as api.ApiGuarantor;
}

/** Attach a saved vault collateral item to an application (same as web portal). */
export async function attachBorrowerVaultCollateralToApplication(
  collateralId: number,
  applicationId: number
): Promise<api.ApiCollateral> {
  if (useLocalStorage()) throw new Error('Attach collateral requires API');

  const remote = await runOnlineFirstRemote('attachBorrowerVaultCollateral', async () => {
    const token = await requireClientToken();
    return api.apiAttachBorrowerVaultCollateralToApplication(token, collateralId, applicationId);
  });
  if (remote.ok) return remote.value;

  await enqueueSync(
    'ATTACH_VAULT_COLLATERAL',
    'application',
    `vault-${collateralId}-${applicationId}`,
    { collateral_id: collateralId, application_ref: applicationId }
  );
  await runSyncIfOnline({ forceNetworkCheck: true });
  return { id: QUEUED_OFFLINE_ID, collateral_type: 'QUEUED', description: 'Queued attach' } as api.ApiCollateral;
}

/** Attach a saved catalog guarantor to an application (same as web portal). */
export async function attachBorrowerCatalogGuarantorToApplication(
  guarantorId: number,
  applicationId: number
): Promise<api.ApiGuarantor> {
  if (useLocalStorage()) throw new Error('Attach guarantor requires API');

  const remote = await runOnlineFirstRemote('attachBorrowerCatalogGuarantor', async () => {
    const token = await requireClientToken();
    return api.apiAttachBorrowerCatalogGuarantorToApplication(token, guarantorId, applicationId);
  });
  if (remote.ok) return remote.value;

  await enqueueSync(
    'ATTACH_CATALOG_GUARANTOR',
    'application',
    `catalog-${guarantorId}-${applicationId}`,
    { guarantor_id: guarantorId, application_ref: applicationId }
  );
  await runSyncIfOnline({ forceNetworkCheck: true });
  return { id: QUEUED_OFFLINE_ID, full_name: 'Queued attach' } as api.ApiGuarantor;
}

/** Staff attach vault collateral to application (reuse, no recreate). */
export async function staffAttachVaultCollateralToApplication(
  applicationId: number,
  collateralId: number
): Promise<api.ApiCollateral> {
  if (useLocalStorage()) throw new Error('Attach collateral requires API');
  const token = await getToken();
  return api.apiStaffAttachVaultCollateralToApplication(token, applicationId, collateralId);
}

/** Staff attach catalog guarantor to application (reuse, no recreate). */
export async function staffAttachCatalogGuarantorToApplication(
  applicationId: number,
  guarantorId: number
): Promise<api.ApiGuarantor> {
  if (useLocalStorage()) throw new Error('Attach guarantor requires API');
  const token = await getToken();
  return api.apiStaffAttachCatalogGuarantorToApplication(token, applicationId, guarantorId);
}

export async function getPendingCustomerPayments(): Promise<api.PendingCustomerPayment[]> {
  if (useLocalStorage()) return [];
  try {
    const token = await requireClientToken();
    return await api.apiGetPendingCustomerPayments(token);
  } catch {
    return [];
  }
}

export async function deleteBorrowerApplicationGuarantor(
  applicationId: number,
  guarantorId: number
): Promise<void> {
  if (useLocalStorage()) return;
  const token = await requireClientToken();
  await api.apiDeleteBorrowerApplicationGuarantor(token, applicationId, guarantorId);
}

export async function getApplicationCollateral(applicationId: number): Promise<api.ApiCollateral[]> {
  if (useLocalStorage()) return [];
  const token = await getToken();
  return api.apiGetApplicationCollateral(token, applicationId);
}

export async function getApplicationGuarantors(applicationId: number): Promise<api.ApiGuarantor[]> {
  if (useLocalStorage()) return [];
  const token = await getToken();
  return api.apiGetApplicationGuarantors(token, applicationId);
}

export async function addApplicationGuarantor(
  applicationId: number,
  guarantor: {
    client_id?: number;
    full_name: string;
    national_id?: string;
    email?: string;
    phone_number?: string;
    address?: string;
    relationship_to_borrower?: string;
    occupation?: string;
    monthly_income?: number;
    guarantee_amount?: number;
    guaranteed_for_client_id?: number;
  }
): Promise<api.ApiGuarantor> {
  if (useLocalStorage()) throw new Error('Add guarantor requires API');

  const remote = await runOnlineFirstRemote('addApplicationGuarantor', async () => {
    const token = await getToken();
    return api.apiAddApplicationGuarantor(token, applicationId, guarantor);
  });
  if (remote.ok) return remote.value;

  await enqueueSync(
    'ADD_APPLICATION_GUARANTOR',
    'application',
    attachmentQueueKey(applicationId),
    { application_ref: applicationId, audience: 'staff', guarantor }
  );
  await runSyncIfOnline({ forceNetworkCheck: true });
  return { id: QUEUED_OFFLINE_ID, ...guarantor } as unknown as api.ApiGuarantor;
}

export async function getBorrowerGuarantorCatalog(): Promise<
  import('./guarantor-catalog').GuarantorCatalogEntry[]
> {
  if (useLocalStorage()) return [];
  const token = await getToken();
  const { apiGetBorrowerGuarantorCatalog } = await import('./guarantor-catalog');
  return apiGetBorrowerGuarantorCatalog(token);
}

export async function addBorrowerGuarantorCatalog(
  input: import('./guarantor-catalog').GuarantorCatalogInput
): Promise<import('./guarantor-catalog').GuarantorCatalogEntry> {
  if (useLocalStorage()) throw new Error('Guarantor catalog requires API');
  const token = await getToken();
  const { apiAddBorrowerGuarantorCatalog } = await import('./guarantor-catalog');
  return apiAddBorrowerGuarantorCatalog(token, input);
}

export async function getStaffClientGuarantors(
  borrowerClientId: number
): Promise<import('./guarantor-catalog').GuarantorCatalogEntry[]> {
  if (useLocalStorage()) return [];
  const token = await getToken();
  const { apiGetStaffClientGuarantors } = await import('./guarantor-catalog');
  return apiGetStaffClientGuarantors(token, borrowerClientId);
}

export async function upsertStaffClientGuarantor(
  borrowerClientId: number,
  input: import('./guarantor-catalog').GuarantorCatalogInput
): Promise<import('./guarantor-catalog').GuarantorCatalogEntry | null> {
  if (useLocalStorage()) throw new Error('Guarantor catalog requires API');
  const token = await getToken();
  const { apiUpsertStaffClientGuarantor } = await import('./guarantor-catalog');
  return apiUpsertStaffClientGuarantor(token, borrowerClientId, input);
}

export async function deleteApplicationGuarantor(applicationId: number, guarantorId: number): Promise<void> {
  if (useLocalStorage()) return;
  const token = await getToken();
  await api.apiDeleteApplicationGuarantor(token, applicationId, guarantorId);
}

export async function deleteApplicationCollateral(applicationId: number, collateralId: number): Promise<void> {
  if (useLocalStorage()) return;
  const token = await getToken();
  await api.apiDeleteApplicationCollateral(token, applicationId, collateralId);
}

export async function getLoanGuarantors(loanId: number): Promise<api.ApiGuarantor[]> {
  if (useLocalStorage()) return [];
  const token = await getToken();
  return api.apiGetLoanGuarantors(token, loanId);
}

export async function addLoanGuarantor(
  loanId: number,
  guarantor: {
    client_id?: number;
    full_name: string;
    national_id?: string;
    email?: string;
    phone_number?: string;
    address?: string;
    relationship_to_borrower?: string;
    occupation?: string;
    monthly_income?: number;
    guarantee_amount?: number;
  }
): Promise<api.ApiGuarantor | null> {
  if (useLocalStorage()) return null;
  const token = await getToken();
  return api.apiAddLoanGuarantor(token, loanId, guarantor);
}

export async function removeLoanGuarantor(loanId: number, guarantorId: number): Promise<void> {
  if (useLocalStorage()) return;
  const token = await getToken();
  await api.apiRemoveLoanGuarantor(token, loanId, guarantorId);
}

export async function setApplicationCollateralLocation(
  applicationId: number,
  collateralId: number,
  location: import('./geolocation-types').GeolocationInput
): Promise<import('./geolocation-types').GeolocationResponse> {
  if (useLocalStorage()) throw new Error('Collateral location requires API');
  const token = await getToken();
  return api.apiSetApplicationCollateralLocation(token, applicationId, collateralId, location);
}

export async function setLoanCollateralLocation(
  loanId: number,
  collateralId: number,
  location: import('./geolocation-types').GeolocationInput
): Promise<import('./geolocation-types').GeolocationResponse> {
  if (useLocalStorage()) throw new Error('Collateral location requires API');
  const token = await getToken();
  return api.apiSetLoanCollateralLocation(token, loanId, collateralId, location);
}

export async function setCollateralGeolocation(
  collateralId: number,
  location: import('./geolocation-types').GeolocationInput
): Promise<import('./geolocation-types').GeolocationResponse> {
  if (useLocalStorage()) throw new Error('Collateral location requires API');
  const token = await getToken();
  return api.apiUpsertCollateralGeolocation(token, collateralId, location);
}

export async function getLoanCollateral(loanId: number): Promise<api.ApiCollateral[]> {
  if (useLocalStorage()) return [];
  const token = await getToken();
  return api.apiGetLoanCollateral(token, loanId);
}

export async function addLoanCollateral(
  loanId: number,
  collateral: {
    collateral_type: string;
    description: string;
    estimated_value: number;
    registration_number?: string;
    other_type_label?: string;
    geolocation?: import('./geolocation-types').GeolocationInput;
    documents?: Array<{ uri: string; name: string; docType: string }>;
  }
): Promise<api.ApiCollateral> {
  if (useLocalStorage()) throw new Error('Loan collateral requires API');
  const token = await getToken();
  let documentKeys: Array<{ key: string; file_name: string; doc_type: string }> | undefined;
  if (collateral.documents && collateral.documents.length > 0) {
    const { uploadCollateralDocument } = await import('./mediaService');
    documentKeys = await Promise.all(
      collateral.documents.map(async (d) => {
        const res = await uploadCollateralDocument(d.uri, token, {
          fileName: d.name,
          docType: d.docType,
        });
        return { key: res.key, file_name: d.name, doc_type: d.docType };
      })
    );
  }
  const created = await api.apiAddLoanCollateral(token, loanId, {
    collateral_type: collateral.collateral_type,
    description: collateral.description,
    estimated_value: collateral.estimated_value,
    registration_number: collateral.registration_number,
    other_type_label: collateral.other_type_label,
    document_keys: documentKeys,
  });
  // Apply GPS mark after create to keep location writes reliable and explicit.
  if (collateral.geolocation && created?.id) {
    await api.apiSetLoanCollateralLocation(token, loanId, created.id, collateral.geolocation);
  }
  return created;
}

export type { LoanApplicationRow, ClientRow, PickedDocument } from './types';
export type {
  OriginationStatus,
  ApiCollateral,
  ApiGuarantor,
  LoanOriginationTransitionBody,
  MobileClientSessionContext,
  MobileGroupMemberCredentialsItem,
  MobileApplicationWorkflowResponse,
  MobileApplicationWorkflowStep,
  CustomerNotificationRow,
  StaffNotificationRow,
} from './api';
export type {
  GuarantorCatalogEntry,
  GuarantorCatalogInput,
} from './guarantor-catalog';
export type {
  GroupOriginationValidateRequest,
  GroupOriginationValidateResponse,
  GroupLoanAggregateResponse,
  GroupMemberCreateInput,
  GroupClientLeaderResponse,
  GroupClientLeaderSlotUpsert,
  GroupClientLeaderCustomCreate,
  GroupClientLeaderPatch,
} from './group-loan-types';

// ─── Loans (for stores) ────────────────────────────────────────────────────

function mapCachedLoanToApi(l: sqlite.CachedLoanRow): api.ApiLoan {
  return {
    id: l.id,
    loan_account_number: l.loan_account_number,
    client_id: l.client_id ?? 0,
    client_name: l.client_name ?? 'Unknown Client',
    product_name: l.product_name ?? 'Loan',
    principal_amount: l.principal_amount,
    outstanding_principal: l.outstanding_principal,
    total_repaid: l.total_repaid ?? 0,
    status: l.status,
    next_due_date: l.next_due_date ?? '',
    days_in_arrears: l.days_in_arrears ?? 0,
    days_until_next_repayment: l.days_until_next_repayment ?? null,
    repayment_tracking_live:
      l.repayment_tracking_live == null ? undefined : Boolean(l.repayment_tracking_live),
  };
}

export type LoansPage = api.ApiLoansPage;

export async function getLoansPage(
  isStaff: boolean,
  opts?: {
    assignedOnly?: boolean;
    supervisedOnly?: boolean;
    creditBook?: string;
    isAgricultural?: boolean;
    isLegacy?: boolean;
    legacyQueue?: 'active' | 'archive' | 'needs_verification' | 'sent_to_accountant';
    includeFundingPreview?: boolean;
    hasBalance?: boolean;
    page?: number;
    limit?: number;
  }
): Promise<LoansPage> {
  const empty: LoansPage = { data: [], total: 0, page: 1, size: opts?.limit ?? 20, pages: 1 };
  if (useLocalStorage()) {
    const cached = await sqlite.sqliteGetCachedLoans();
    const data = cached.map(mapCachedLoanToApi);
    return { data, total: data.length, page: 1, size: data.length || 20, pages: 1 };
  }
  const bookKey = opts?.creditBook ? `_${opts.creditBook}` : '';
  const agriKey = opts?.isAgricultural ? '_agri' : '';
  const vintageKey = opts?.isLegacy === true ? '_legacy' : opts?.isLegacy === false ? '_recent' : '';
  const queueKey = opts?.legacyQueue ? `_q${opts.legacyQueue}` : '';
  const balanceKey =
    opts?.hasBalance === true ? '_bal' : opts?.hasBalance === false ? '_nobal' : '';
  const pageKey = opts?.page ? `_p${opts.page}` : '';
  const cacheKey = `loans_${isStaff ? (opts?.supervisedOnly ? 'staff_supervised' : opts?.assignedOnly ? 'staff_assigned' : 'staff') : 'client'}${bookKey}${agriKey}${vintageKey}${queueKey}${balanceKey}${pageKey}`;
  try {
    const token = await getToken();
    if (!isStaff) {
      const loans = await api.apiGetMyLoans(token);
      return { data: loans, total: loans.length, page: 1, size: loans.length || 20, pages: 1 };
    }
    const page = await api.apiGetLoans(token, {
      assigned_only: opts?.assignedOnly,
      supervised_only: opts?.supervisedOnly,
      credit_book: opts?.creditBook,
      is_agricultural: opts?.isAgricultural,
      is_legacy: opts?.isLegacy,
      legacy_queue: opts?.legacyQueue,
      include_funding_preview: opts?.includeFundingPreview,
      has_balance: opts?.hasBalance,
      skip: Math.max(0, ((opts?.page ?? 1) - 1) * (opts?.limit ?? 20)),
      limit: opts?.limit ?? 20,
    });
    if (page.data.length > 0) {
      await setCached(cacheKey, page.data);
      await sqlite.sqliteUpsertLoansCache(page.data.map((l) => ({
        id: l.id,
        loan_account_number: l.loan_account_number,
        client_id: l.client_id,
        client_name: l.client_name,
        product_name: l.product_name,
        principal_amount: l.principal_amount,
        outstanding_principal: l.outstanding_principal,
        total_repaid: l.total_repaid,
        status: l.status,
        next_due_date: l.next_due_date,
        days_in_arrears: l.days_in_arrears ?? 0,
        days_until_next_repayment: l.days_until_next_repayment ?? null,
        repayment_tracking_live:
          l.repayment_tracking_live === true ? 1 : l.repayment_tracking_live === false ? 0 : null,
        cached_at: '',
      })));
    }
    return page;
  } catch (e) {
    const scoped = await getCached<api.ApiLoan[]>(cacheKey);
    if (scoped && scoped.length > 0) {
      return { data: scoped, total: scoped.length, page: 1, size: scoped.length, pages: 1 };
    }
    const cached = await sqlite.sqliteGetCachedLoans();
    if (cached.length > 0) {
      const data = cached.map(mapCachedLoanToApi);
      return { data, total: data.length, page: 1, size: data.length, pages: 1 };
    }
    if (!isNetworkError(e)) throw e;
    return empty;
  }
}

export async function getLoans(
  isStaff: boolean,
  assignedOnly?: boolean,
  supervisedOnly?: boolean,
  creditBook?: string
): Promise<api.ApiLoan[]> {
  const page = await getLoansPage(isStaff, { assignedOnly, supervisedOnly, creditBook, limit: 100 });
  return page.data;
}

export async function getLoanSchedule(loanId: number) {
  if (useLocalStorage()) {
    const cached = await sqlite.sqliteGetScheduleCache(loanId);
    return (cached?.items ?? []) as api.ApiScheduleItem[];
  }
  try {
    const token = await getToken();
    const items = await api.apiGetLoanSchedule(token, loanId);
    if (items.length > 0) {
      await sqlite.sqliteUpsertScheduleCache(loanId, items);
    }
    return items;
  } catch (e) {
    const cached = await sqlite.sqliteGetScheduleCache(loanId);
    if (cached && cached.items.length > 0) {
      return cached.items as api.ApiScheduleItem[];
    }
    if (isNetworkError(e)) return [];
    throw e;
  }
}

export async function getLoansLastSyncedAt(): Promise<string | null> {
  return sqlite.sqliteGetLoansCacheSyncedAt();
}

export async function generateLoanSchedule(loanId: number) {
  if (useLocalStorage()) throw new Error('Generate schedule requires API');
  const token = await getToken();
  return api.apiGenerateLoanSchedule(token, loanId);
}

// ─── Repayments (for stores) ───────────────────────────────────────────────

export async function getStaffRepayments(): Promise<{ repayments: api.ApiRepayment[] }> {
  const pending = await sqlite.sqliteGetPendingRepayments();
  const pendingAsApi: api.ApiRepayment[] = pending.map((p) => ({
    id: p.id,
    loan_id: p.loan_id,
    loan_account_number: p.loan_account_number,
    total_amount: p.amount,
    amount: p.amount,
    principal_amount: p.principal_amount,
    interest_amount: p.interest_amount,
    repayment_date: p.repayment_date,
    status: 'PENDING',
    internal_status: 'PENDING',
    sync_status: (p.sync_status || 'pending') as 'pending' | 'synced' | 'failed',
  }));

  if (useLocalStorage()) return { repayments: pendingAsApi };

  if (await isOnline()) {
    try {
      const token = await getToken();
      const history = await api.apiGetPortfolioHistory(token, { limit: 100 });
      const pendingIds = new Set(pendingAsApi.map((p) => p.id));
      const remote = history.filter((r) => !pendingIds.has(r.id));
      return { repayments: [...pendingAsApi, ...remote].slice(0, 150) };
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }
  return { repayments: pendingAsApi };
}

export async function getStaffRepaymentsFiltered(opts?: {
  search?: string;
  status?: string;
}): Promise<api.ApiRepayment[]> {
  if (useLocalStorage() || !(await isOnline())) {
    const { repayments } = await getStaffRepayments();
    const q = (opts?.search || '').trim().toLowerCase();
    return repayments.filter((r) => {
      if (opts?.status && opts.status !== 'ALL') {
        const st = (r.status || '').toUpperCase();
        if (opts.status === 'AWAITING_VERIFICATION' && st !== 'AWAITING_VERIFICATION') return false;
        if (opts.status === 'PAID' && !['COMPLETED', 'PAID', 'PENDING_CONFIRMATION'].includes(st))
          return false;
        if (opts.status === 'REVERSED' && st !== 'REVERSED') return false;
        if (opts.status === 'PENDING' && !['PENDING', 'DRAFT'].includes(st)) return false;
      }
      if (!q) return true;
      return (
        (r.loan_account_number || '').toLowerCase().includes(q) ||
        (r.client_name || '').toLowerCase().includes(q) ||
        (r.reference_number || '').toLowerCase().includes(q)
      );
    });
  }
  const token = await getToken();
  return api.apiGetPortfolioHistory(token, {
    limit: 100,
    search: opts?.search,
    status: opts?.status && opts.status !== 'ALL' ? opts.status : undefined,
  });
}

export async function getStaffRepaymentHub(opts?: {
  search?: string;
}): Promise<{
  dueToday: api.ApiRepaymentOverviewItem[];
  overdue: api.ApiRepaymentOverviewItem[];
  upcoming: api.ApiRepaymentOverviewItem[];
}> {
  if (useLocalStorage() || !(await isOnline())) {
    return { dueToday: [], overdue: [], upcoming: [] };
  }
  const token = await getToken();
  const search = opts?.search?.trim() || undefined;
  const [dueToday, overdue, upcoming] = await Promise.all([
    api.apiGetDueToday(token, { search, limit: 200 }),
    api.apiGetOverdue(token, { search, limit: 200 }),
    api.apiGetUpcoming(token, { search, limit: 200 }),
  ]);
  return { dueToday, overdue, upcoming };
}

/** Repayments waiting on operations verification for the LO portfolio. */
export async function getStaffAwaitingVerificationRepayments(): Promise<api.ApiRepayment[]> {
  if (useLocalStorage() || !(await isOnline())) return [];
  const token = await getToken();
  return api.apiGetPortfolioHistory(token, {
    status: 'AWAITING_VERIFICATION',
    limit: 100,
  });
}

export async function getClientRepayments(): Promise<api.ApiRepayment[]> {
  if (useLocalStorage()) return [];
  if (await isOnline()) {
    try {
      const token = await getToken();
      const reps = await api.apiGetCustomerRepayments(token, 100);
      return reps.map((r) => ({
        ...r,
        loan_account_number: r.loan_account_number ?? '',
        repayment_date: typeof r.repayment_date === 'string' ? r.repayment_date.slice(0, 10) : '',
      }));
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }
  return [];
}

export async function getClientRepaymentLifecycle(
  repaymentId: number
): Promise<api.ApiRepaymentLifecycleResponse> {
  const token = await getToken();
  return api.apiGetCustomerRepaymentLifecycle(token, repaymentId);
}

export async function updateClientRepaymentDraft(data: {
  repayment_id: number;
  amount_minor?: number;
  payment_method?: string;
  deposit_receipt_number?: string;
  payment_date?: string;
  reason?: string;
}): Promise<void> {
  const token = await getToken();
  await api.apiUpdateCustomerRepaymentDraft(token, data);
}

export async function deleteClientRepaymentDraft(data: {
  repayment_id: number;
  reason: string;
}): Promise<void> {
  const token = await getToken();
  await api.apiDeleteCustomerRepaymentDraft(token, data);
}

export async function getStaffClientAccounts(clientId: number): Promise<savingsApi.ApiStaffSavingsAccount[]> {
  const token = await getToken();
  return savingsApi.apiGetClientAccounts(token, clientId);
}

export async function createMissingStaffClientAccounts(
  clientId: number
): Promise<savingsApi.ApiCreateMissingAccountsResult> {
  const token = await getToken();
  return savingsApi.apiCreateMissingClientAccounts(token, clientId);
}

export async function createRepayment(
  loanId: number,
  clientId: number,
  amount: number,
  principalAmount: number,
  interestAmount: number,
  loanAccountNumber?: string,
  memberContributions?: Array<{ member_client_id: number; amount: number }>
): Promise<api.ApiRepayment | null> {
  if (useLocalStorage()) return null;
  const now = new Date().toISOString().slice(0, 10);
  // F7: one idempotency key per logical repayment, reused across the online
  // attempt AND the offline-queued fallback below. If the server commits but the
  // HTTP response is lost, isNetworkError() falls through to the queue with the
  // SAME key, so the later sync re-send is deduplicated instead of double-posted.
  const clientReference = sqlite.makeClientReference();
  const remote = await runOnlineFirstRemote('createRepayment', async () => {
    const token = await getToken();
    return api.apiCreateRepayment(
      token,
      loanId,
      clientId,
      amount,
      principalAmount,
      interestAmount,
      memberContributions,
      clientReference
    );
  });
  if (remote.ok) {
    return remote.value;
  }

  const inserted = await sqlite.sqliteInsertPendingRepayment({
    loan_id: loanId,
    client_id: clientId,
    loan_account_number: loanAccountNumber ?? '',
    amount,
    principal_amount: principalAmount,
    interest_amount: interestAmount,
    repayment_date: now,
    client_reference: clientReference,
  });
  await runSyncIfOnline({ forceNetworkCheck: true });
  return {
    id: inserted.id,
    loan_account_number: inserted.loan_account_number,
    total_amount: amount,
    amount,
    principal_amount: principalAmount,
    interest_amount: interestAmount,
    repayment_date: now,
    sync_status: 'pending' as const,
  };
}

// Re-export for stores
export { api };

// ─── Borrower accounts (mobile/me) ───────────────────────────────────────────

export type {
  ApiBankAccount,
  ApiSavingsDeposit,
  ApiSavingsWithdrawal,
  ApiInternalTransfer,
  ApiCollateralBalance,
  ApiCollateralFundResult,
} from './accounts-api';

export async function getClientAccounts(): Promise<accountsApi.ApiBankAccount[]> {
  if (!USE_API) return [];
  const token = await getToken();
  const rows = await accountsApi.apiGetMobileAccounts(token);
  return Array.isArray(rows) ? rows : [];
}

export async function getClientAccountActivity(): Promise<{
  deposits: accountsApi.ApiSavingsDeposit[];
  withdrawals: accountsApi.ApiSavingsWithdrawal[];
  transfers: accountsApi.ApiInternalTransfer[];
}> {
  if (!USE_API) return { deposits: [], withdrawals: [], transfers: [] };
  const token = await getToken();
  // Soft-fail each history endpoint so a single failure does not blank the Accounts tab
  // (web client-portal loads accounts independently of transaction history).
  const [deposits, withdrawals, transfers] = await Promise.all([
    accountsApi.apiGetMobileDeposits(token).catch(() => [] as accountsApi.ApiSavingsDeposit[]),
    accountsApi.apiGetMobileWithdrawals(token).catch(() => [] as accountsApi.ApiSavingsWithdrawal[]),
    accountsApi.apiGetMobileTransfers(token).catch(() => [] as accountsApi.ApiInternalTransfer[]),
  ]);
  return {
    deposits: Array.isArray(deposits) ? deposits : [],
    withdrawals: Array.isArray(withdrawals) ? withdrawals : [],
    transfers: Array.isArray(transfers) ? transfers : [],
  };
}

export async function getClientCollateralBalance(): Promise<accountsApi.ApiCollateralBalance | null> {
  if (!USE_API) return null;
  try {
    const token = await getToken();
    return await accountsApi.apiGetMobileCollateralBalance(token);
  } catch {
    return null;
  }
}

export async function getClientCollateralLocks(): Promise<accountsApi.ApiCollateralLoanLockSummary[]> {
  if (!USE_API) return [];
  try {
    const token = await getToken();
    return await accountsApi.apiGetMobileCollateralLocks(token);
  } catch {
    return [];
  }
}

function accountQueueKey(kind: string): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type CustomerRepaymentSubmitInput = {
  loan_id: number;
  amount_minor: number;
  payment_method?: string;
  deposit_receipt_number?: string;
  deposit_receipt_url?: string;
  reference_number?: string;
  payment_date?: string;
  selected_installment_ids?: number[];
  installment_allocation_plan?: Record<string, unknown> | null;
  recorded_by_member_id?: number;
  /** Local receipt file for offline queue upload on sync. */
  receipt_local_uri?: string;
  receipt_file_name?: string;
  receipt_prefix?: string;
};

/**
 * Borrower / group-chair deposit-style repayment (POST /customer/repayments).
 * Online-first; queues CREATE_CUSTOMER_REPAYMENT when the data link is down.
 */
export async function submitCustomerRepayment(
  input: CustomerRepaymentSubmitInput
): Promise<api.ApiRepayment | { id: number; status: 'QUEUED_OFFLINE' }> {
  const remote = await runOnlineFirstRemote('submitCustomerRepayment', async () => {
    const token = await getToken();
    let deposit_receipt_url = input.deposit_receipt_url;
    if (!deposit_receipt_url && input.receipt_local_uri) {
      const { uploadCollateralDocument } = await import('./mediaService');
      const uploaded = await uploadCollateralDocument(input.receipt_local_uri, token, {
        fileName: input.receipt_file_name,
        audience: 'client',
        prefix: input.receipt_prefix ?? 'client-receipts',
      });
      deposit_receipt_url = uploaded.url || uploaded.key;
    }
    return api.apiCreateCustomerRepayment(token, {
      loan_id: input.loan_id,
      amount_minor: input.amount_minor,
      payment_method: input.payment_method,
      deposit_receipt_number: input.deposit_receipt_number,
      deposit_receipt_url,
      reference_number: input.reference_number,
      payment_date: input.payment_date,
      selected_installment_ids: input.selected_installment_ids,
      installment_allocation_plan: input.installment_allocation_plan,
      recorded_by_member_id: input.recorded_by_member_id,
    });
  });
  if (remote.ok) return remote.value;

  const localId = accountQueueKey('customer-repayment');
  await enqueueSync('CREATE_CUSTOMER_REPAYMENT', 'repayment', localId, {
    loan_id: input.loan_id,
    amount_minor: input.amount_minor,
    payment_method: input.payment_method,
    deposit_receipt_number: input.deposit_receipt_number,
    deposit_receipt_url: input.deposit_receipt_url,
    reference_number: input.reference_number,
    payment_date: input.payment_date,
    selected_installment_ids: input.selected_installment_ids,
    installment_allocation_plan: input.installment_allocation_plan,
    recorded_by_member_id: input.recorded_by_member_id,
    receipt_local_uri: input.receipt_local_uri,
    receipt_file_name: input.receipt_file_name,
    receipt_prefix: input.receipt_prefix,
  });
  await runSyncIfOnline({ forceNetworkCheck: true });
  return { id: QUEUED_OFFLINE_ID, status: 'QUEUED_OFFLINE' };
}

async function uploadDepositReceiptIfNeeded(
  token: string,
  input: {
    receipt_local_uri?: string;
    receipt_file_name?: string;
    receipt_path?: string;
  },
  audience: 'client' | 'staff'
): Promise<string | undefined> {
  if (input.receipt_path) return input.receipt_path;
  if (!input.receipt_local_uri) return undefined;
  const { uploadCollateralDocument } = await import('./mediaService');
  const uploaded = await uploadCollateralDocument(input.receipt_local_uri, token, {
    fileName: input.receipt_file_name,
    audience,
    prefix: 'client-deposit-receipts',
  });
  return uploaded.url || uploaded.key;
}

export async function submitClientDeposit(input: {
  account_id: number;
  amount_minor: number;
  deposit_method?: string;
  reference_number?: string;
  notes?: string;
  receipt_path?: string;
  receipt_metadata?: Record<string, unknown>;
  receipt_local_uri?: string;
  receipt_file_name?: string;
}) {
  const remote = await runOnlineFirstRemote('submitClientDeposit', async () => {
    const token = await getToken();
    const receipt_path = await uploadDepositReceiptIfNeeded(token, input, 'client');
    return accountsApi.apiCreateAndSubmitDeposit(token, {
      account_id: input.account_id,
      amount_minor: input.amount_minor,
      deposit_method: input.deposit_method,
      reference_number: input.reference_number,
      notes: input.notes,
      receipt_path,
      receipt_metadata: input.receipt_metadata,
    });
  });
  if (remote.ok) return remote.value;

  const localId = accountQueueKey('deposit');
  await enqueueSync('CREATE_CLIENT_DEPOSIT', 'account', localId, { ...input });
  await runSyncIfOnline({ forceNetworkCheck: true });
  return {
    id: QUEUED_OFFLINE_ID,
    deposit_number: localId,
    account_id: input.account_id,
    amount_minor: input.amount_minor,
    currency: 'MWK',
    deposit_method: input.deposit_method ?? 'CASH',
    reference_number: input.reference_number ?? null,
    status: 'QUEUED_OFFLINE',
    created_at: new Date().toISOString(),
  } as accountsApi.ApiSavingsDeposit;
}

export async function submitClientWithdrawal(input: {
  account_id: number;
  amount_minor: number;
  withdrawal_method?: string;
  reference_number?: string;
  notes?: string;
}) {
  const remote = await runOnlineFirstRemote('submitClientWithdrawal', async () => {
    const token = await getToken();
    return accountsApi.apiCreateAndSubmitWithdrawal(token, input);
  });
  if (remote.ok) return remote.value;

  const localId = accountQueueKey('withdrawal');
  await enqueueSync('CREATE_CLIENT_WITHDRAWAL', 'account', localId, { ...input });
  await runSyncIfOnline({ forceNetworkCheck: true });
  return {
    id: QUEUED_OFFLINE_ID,
    withdrawal_number: localId,
    account_id: input.account_id,
    amount_minor: input.amount_minor,
    currency: 'MWK',
    withdrawal_method: input.withdrawal_method ?? 'CASH',
    status: 'QUEUED_OFFLINE',
    created_at: new Date().toISOString(),
  } as accountsApi.ApiSavingsWithdrawal;
}

export async function submitClientTransfer(input: {
  source_account_id: number;
  destination_account_id: number;
  amount_minor: number;
  transfer_purpose?: string;
  loan_id?: number;
  notes?: string;
}) {
  const remote = await runOnlineFirstRemote('submitClientTransfer', async () => {
    const token = await getToken();
    return accountsApi.apiCreateAndSubmitTransfer(token, input);
  });
  if (remote.ok) return remote.value;

  const localId = accountQueueKey('transfer');
  await enqueueSync('CREATE_CLIENT_TRANSFER', 'account', localId, { ...input });
  await runSyncIfOnline({ forceNetworkCheck: true });
  return {
    id: QUEUED_OFFLINE_ID,
    transfer_number: localId,
    source_account_id: input.source_account_id,
    destination_account_id: input.destination_account_id,
    amount_minor: input.amount_minor,
    currency: 'MWK',
    transfer_purpose: input.transfer_purpose ?? null,
    notes: input.notes ?? null,
    status: 'QUEUED_OFFLINE',
    created_at: new Date().toISOString(),
  } as accountsApi.ApiInternalTransfer;
}

export async function getClientTransferLoanOptions(): Promise<accountsApi.MobileLoanOption[]> {
  if (!USE_API) return [];
  try {
    const token = await getToken();
    return await accountsApi.apiGetMobileLoanOptionsForTransfer(token);
  } catch {
    return [];
  }
}

/** Staff: active loans for a client (optional loan_id on LOAN_REPAYMENT transfers). */
export async function getStaffClientTransferLoanOptions(
  clientId: number
): Promise<accountsApi.MobileLoanOption[]> {
  if (!USE_API || !Number.isFinite(clientId) || clientId <= 0) return [];
  try {
    const token = await getToken();
    const rows = await api.apiGetClientLoans(token, clientId);
    return rows
      .filter((l) => {
        const s = String(l.status || '').toUpperCase();
        return s === 'ACTIVE' || s === 'DISBURSED' || s === 'IN_ARREARS' || s === 'CURRENT';
      })
      .map((l) => ({
        id: l.id,
        loan_account_number: l.loan_account_number,
        outstanding_principal: l.outstanding_principal,
        status: l.status,
      }));
  } catch {
    return [];
  }
}

export async function submitStaffClientDeposit(
  clientId: number,
  input: {
    account_id: number;
    amount_minor: number;
    deposit_method?: string;
    reference_number?: string;
    notes?: string;
    receipt_path?: string;
    receipt_metadata?: Record<string, unknown>;
    receipt_local_uri?: string;
    receipt_file_name?: string;
  }
) {
  const token = await getToken();
  const receipt_path = await uploadDepositReceiptIfNeeded(token, input, 'staff');
  return savingsApi.apiCreateAndSubmitStaffDeposit(token, {
    client_id: clientId,
    account_id: input.account_id,
    amount_minor: input.amount_minor,
    deposit_method: input.deposit_method,
    reference_number: input.reference_number,
    notes: input.notes,
    receipt_path,
    receipt_metadata: input.receipt_metadata,
  });
}

export async function submitStaffClientWithdrawal(
  clientId: number,
  input: {
    account_id: number;
    amount_minor: number;
    withdrawal_method?: string;
    reference_number?: string;
    notes?: string;
  }
) {
  const token = await getToken();
  return savingsApi.apiCreateAndSubmitStaffWithdrawal(token, {
    client_id: clientId,
    ...input,
  });
}

export async function submitStaffClientTransfer(
  clientId: number,
  input: {
    source_account_id: number;
    destination_account_id: number;
    amount_minor: number;
    transfer_purpose?: string;
    loan_id?: number;
    notes?: string;
  }
) {
  const token = await getToken();
  return savingsApi.apiCreateAndSubmitStaffTransfer(token, {
    client_id: clientId,
    ...input,
  });
}

/**
 * Staff cash collateral balance card (staff JWT → /cash-collateral/balance/{clientId}).
 * Returns null when the API is off / the client has no collateral account so
 * the card can fall back to a "provision via Create missing" hint.
 */
export async function getStaffClientCashCollateralBalance(
  clientId: number
): Promise<savingsApi.ApiStaffClientCashCollateralBalance | null> {
  if (!USE_API || !Number.isFinite(clientId) || clientId <= 0) return null;
  try {
    const token = await getToken();
    return await savingsApi.apiGetStaffClientCashCollateralBalance(token, clientId);
  } catch {
    return null;
  }
}

/** Staff cash collateral funding (staff JWT → POST /cash-collateral/fund). */
export async function fundStaffClientCashCollateral(
  clientId: number,
  input: { source_account_id: number; amount_minor: number; chairperson_id?: number }
): Promise<savingsApi.ApiStaffClientCashCollateralFundResult> {
  const token = await getToken();
  return savingsApi.apiFundStaffClientCashCollateral(token, { client_id: clientId, ...input });
}

export async function fundClientCollateral(input: { source_account_id: number; amount_minor: number }) {
  const remote = await runOnlineFirstRemote('fundClientCollateral', async () => {
    const token = await getToken();
    return accountsApi.apiFundMobileCollateral(token, input);
  });
  if (remote.ok) return remote.value;

  const localId = accountQueueKey('fund-collateral');
  await enqueueSync('FUND_CLIENT_COLLATERAL', 'account', localId, { ...input });
  await runSyncIfOnline({ forceNetworkCheck: true });
  return {
    transfer_id: QUEUED_OFFLINE_ID,
    amount_minor: input.amount_minor,
    destination_account_number: 'queued',
    message: 'Saved on this device. Will upload when you are back online.',
    balance: {
      total_balance: 0,
      locked_balance: 0,
      available_balance: 0,
    },
  } as accountsApi.ApiCollateralFundResult;
}

// ─── Client Documents ─────────────────────────────────────────────────────────

export async function getClientDocuments(clientId: number): Promise<api.ApiClientDocument[]> {
  if (useLocalStorage()) return [];
  const token = await getToken();
  return api.apiGetClientDocuments(token, clientId);
}

export async function addClientDocument(
  clientId: number,
  data: {
    document_type: string;
    file_name: string;
    uri: string;
    mime_type?: string;
  }
): Promise<api.ApiClientDocument | null> {
  if (useLocalStorage()) return null;
  const token = await getToken();
  return api.apiAddClientDocument(token, clientId, data);
}

export async function deleteClientDocument(clientId: number, documentId: number): Promise<void> {
  if (useLocalStorage()) return;
  const token = await getToken();
  await api.apiDeleteClientDocument(token, clientId, documentId);
}

// ─── Client Collateral Vault ──────────────────────────────────────────────────

export async function getClientCollateralVault(clientId: number): Promise<api.ApiClientCollateralVaultItem[]> {
  if (useLocalStorage()) return [];
  const token = await getToken();
  return api.apiGetClientCollateralVault(token, clientId);
}

export async function addClientCollateralVaultItem(
  clientId: number,
  data: {
    collateral_type: string;
    description: string;
    estimated_value: number;
    other_type_label?: string;
    registration_number?: string;
    geolocation?: import('./geolocation-types').GeolocationInput;
    documents?: Array<{ uri: string; name: string; docType: string }>;
  }
): Promise<api.ApiClientCollateralVaultItem | null> {
  if (useLocalStorage()) return null;
  const token = await getToken();
  let documentKeys: Array<{ key: string; file_name: string; doc_type: string }> | undefined;
  if (data.documents && data.documents.length > 0) {
    const { uploadCollateralDocument } = await import('./mediaService');
    documentKeys = await Promise.all(
      data.documents.map(async (d) => {
        const res = await uploadCollateralDocument(d.uri, token, {
          fileName: d.name,
          docType: d.docType,
        });
        return { key: res.key, file_name: d.name, doc_type: d.docType };
      })
    );
  }
  const { documents: _docs, ...rest } = data;
  const created = await api.apiAddClientCollateralVaultItem(token, clientId, {
    ...rest,
    document_keys: documentKeys,
  });
  if (data.geolocation && created?.id) {
    await api.apiUpsertCollateralGeolocation(token, created.id, data.geolocation);
  }
  return created;
}

export async function deleteClientCollateralVaultItem(clientId: number, itemId: number): Promise<void> {
  if (useLocalStorage()) return;
  const token = await getToken();
  await api.apiDeleteClientCollateralVaultItem(token, clientId, itemId);
}

export type { ApiClientDocument, ApiClientCollateralVaultItem } from './api';
