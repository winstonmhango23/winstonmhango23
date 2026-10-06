/**
 * Sync service – processes pending queue when online.
 * Order: portal registrations (no auth) → repayments → clients → group members → applications.
 */

import * as SQLite from 'expo-sqlite';
import { getAppDatabase } from '@/lib/data/sqlite';
import * as sqlite from '@/lib/data/sqlite';
import { readLiveAuthCredentials } from '@/lib/auth-session-sync';
import { resolveAuthTokenForSync } from '@/lib/auth-token';
import { beginSyncAuthGuard, endSyncAuthGuard } from '@/lib/sync/sync-auth-guard';
import * as api from '@/lib/data/api';
import type { GeolocationInput } from '@/lib/data/geolocation-types';
import { ApiClientError } from '@/lib/api-client';
import { networkManager } from '@/lib/network-manager';
import { logger } from '@/lib/logger';
import type { LoanApplicationRow } from '@/lib/data/types';
import {
  registerPortalGroup,
  registerPortalIndividual,
  uploadMobileKycDocument,
  type KycUploadField,
  type PortalGroupRegisterPayload,
  type PortalIndividualRegisterPayload,
} from '@/lib/client-portal/api';
import { storeKycUploadResult } from '@/lib/client-portal/kyc-offline-upload';
import {
  PORTAL_SYNC_OPERATIONS,
  SYNC_OPERATION_ORDER,
  type SyncOperation,
  type SyncQueueRow,
  type SyncQueueSummaryItem,
} from './types';
import type { GroupMemberCreateInput } from '@/lib/data/group-loan-types';

const OFFLINE_DEFERRED_PREFIX = 'OFFLINE_DEFERRED:';

function isOfflineDeferredError(message: string): boolean {
  return message.startsWith(OFFLINE_DEFERRED_PREFIX);
}

async function resolveSyncAuthToken(): Promise<string | null> {
  return resolveAuthTokenForSync();
}

function buildApplicationSyncPayload(app: LoanApplicationRow): Record<string, unknown> {
  return {
    application_number: app.application_number,
    status: app.status,
    requested_amount: app.requested_amount,
    approved_amount: app.approved_amount,
    requested_term_months: app.requested_term_months,
    product_name: app.product_name,
    application_date: app.application_date,
    client_id: app.client_id,
    client_name: app.client_name,
    purpose: app.purpose,
    documents_json: app.documents_json,
  };
}

/** Prefer the richest queued payload so repair does not drop loan_product_id / group allocation. */
async function resolveApplicationSyncPayload(
  database: SQLite.SQLiteDatabase,
  app: LoanApplicationRow
): Promise<Record<string, unknown>> {
  const prior = await database.getFirstAsync<{ payload: string }>(
    `SELECT payload FROM sync_queue
     WHERE operation IN ('CREATE_APPLICATION', 'UPDATE_APPLICATION')
       AND entity_local_id = ?
     ORDER BY id DESC LIMIT 1`,
    String(app.id)
  );
  if (prior) {
    try {
      const parsed = JSON.parse(prior.payload) as Record<string, unknown>;
      return {
        ...parsed,
        application_number: app.application_number,
        status: app.status,
        requested_amount: app.requested_amount,
        approved_amount: app.approved_amount ?? parsed.approved_amount,
        requested_term_months: app.requested_term_months,
        product_name: app.product_name,
        application_date: app.application_date,
        client_id: app.client_id ?? parsed.client_id,
        client_name: app.client_name ?? parsed.client_name,
        purpose: app.purpose ?? parsed.purpose,
        documents_json: app.documents_json ?? parsed.documents_json,
      };
    } catch {
      /* fall through */
    }
  }
  const allocation = await getPendingApplicationGroupAllocation(app.id);
  const base = buildApplicationSyncPayload(app);
  if (allocation) {
    return { ...base, group_loan_allocation: allocation };
  }
  return base;
}

async function listOrphanPendingApplications(
  database: SQLite.SQLiteDatabase
): Promise<LoanApplicationRow[]> {
  try {
    return await database.getAllAsync<LoanApplicationRow>(
      `SELECT a.* FROM applications a
       WHERE a.sync_status IN ('pending', 'failed')
       AND NOT EXISTS (
         SELECT 1 FROM sync_queue q
         WHERE q.operation IN ('CREATE_APPLICATION', 'UPDATE_APPLICATION')
           AND q.entity_local_id = CAST(a.id AS TEXT)
           AND (q.sync_status IN ('pending', 'failed', 'conflict') OR q.sync_status IS NULL)
       )
       ORDER BY a.id ASC`
    );
  } catch {
    return [];
  }
}

/** Re-queue loan applications that are pending locally but missing from sync_queue. */
export async function repairPendingSyncState(): Promise<number> {
  const database = await getDb();
  const orphans = await listOrphanPendingApplications(database);
  if (orphans.length === 0) return 0;

  for (const app of orphans) {
    const existing = await database.getFirstAsync<{ id: number }>(
      `SELECT id FROM sync_queue
       WHERE operation = 'CREATE_APPLICATION' AND entity_local_id = ?
       ORDER BY id DESC LIMIT 1`,
      String(app.id)
    );
    if (existing) continue;

    await database.runAsync(
      `INSERT INTO sync_queue (operation, entity_type, entity_local_id, payload, created_at, sync_status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      'CREATE_APPLICATION',
      'application',
      String(app.id),
      JSON.stringify(await resolveApplicationSyncPayload(database, app)),
      app.created_at ?? new Date().toISOString()
    );
    if (app.sync_status === 'failed') {
      await database.runAsync(
        "UPDATE applications SET sync_status = 'pending' WHERE id = ?",
        app.id
      );
    }
  }
  return orphans.length;
}

const PORTAL_REGISTRATION_READY_KEY = 'cofi_portal_registration_ready';

export type SyncRunResult = {
  synced: number;
  failed: number;
  skipped?: boolean;
  offline?: boolean;
  noAuth?: boolean;
  repaired?: number;
  deferred?: number;
};

type SyncActivityListener = (active: boolean) => void;

let syncInProgress = false;
const syncActivityListeners = new Set<SyncActivityListener>();

function notifySyncActivity(active: boolean): void {
  syncActivityListeners.forEach((listener) => {
    try {
      listener(active);
    } catch {
      /* ignore listener errors */
    }
  });
}

export function subscribeSyncActivity(listener: SyncActivityListener): () => void {
  syncActivityListeners.add(listener);
  listener(syncInProgress);
  return () => syncActivityListeners.delete(listener);
}

export function isSyncInProgress(): boolean {
  return syncInProgress;
}

async function syncNetworkOnline(forceRefresh = false): Promise<boolean> {
  return forceRefresh ? networkManager.forceRefresh() : networkManager.getIsOnline();
}

export type PortalRegistrationReady = {
  email: string;
  fullName: string;
  accessToken: string;
  refreshToken?: string;
};

function isPortalOperation(operation: string): boolean {
  return (PORTAL_SYNC_OPERATIONS as string[]).includes(operation);
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  return getAppDatabase();
}

function sortQueueRows(rows: SyncQueueRow[]): SyncQueueRow[] {
  return [...rows].sort((a, b) => {
    const orderA = SYNC_OPERATION_ORDER[a.operation as SyncOperation] ?? 99;
    const orderB = SYNC_OPERATION_ORDER[b.operation as SyncOperation] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.id - b.id;
  });
}

async function getRemoteId(db: SQLite.SQLiteDatabase, table: string, localId: number): Promise<number | null> {
  const row = await db.getFirstAsync<{ remote_id: number | null }>(
    `SELECT remote_id FROM ${table} WHERE id = ?`,
    [localId]
  );
  return row?.remote_id ?? null;
}

/**
 * Remote id for an application that may still be a local offline row.
 * Throws an OFFLINE_DEFERRED error when the creation has not uploaded yet, so
 * the attachment stays queued instead of being recorded as a failure.
 */
async function resolveApplicationRemoteId(
  database: SQLite.SQLiteDatabase,
  appRef: string | number
): Promise<number> {
  const ref = String(appRef);
  const row = await database.getFirstAsync<{ remote_id: number | null }>(
    'SELECT remote_id FROM applications WHERE id = ?',
    [ref]
  );
  if (row?.remote_id != null) return row.remote_id;
  const numeric = parseInt(ref, 10);
  if (!ref.startsWith('local-') && !Number.isNaN(numeric)) return numeric;
  throw new Error(
    `${OFFLINE_DEFERRED_PREFIX} Waiting for the loan application to upload first`
  );
}

async function uploadQueuedCollateralDocuments(
  token: string,
  documents: Array<{ uri: string; name: string; docType: string }> | undefined,
  audience: 'staff' | 'client'
): Promise<Array<{ key: string; file_name: string; doc_type: string }> | undefined> {
  if (!documents?.length) return undefined;
  const { uploadCollateralDocument } = await import('@/lib/data/mediaService');
  return Promise.all(
    documents.map(async (d) => {
      const res = await uploadCollateralDocument(d.uri, token, {
        fileName: d.name,
        docType: d.docType,
        ...(audience === 'client' ? { audience: 'client' as const } : {}),
      });
      return { key: res.key, file_name: d.name, doc_type: d.docType };
    })
  );
}

const KYC_DOCUMENT_FIELDS = [
  'profile_photo_path',
  'id_document_path',
  'id_document_back_path',
  'group_constitution_path',
] as const;

/**
 * Drop `queued:` placeholders written while a document was waiting to upload.
 * The real server path is already on the record by the time this row syncs.
 */
function stripQueuedDocumentMarkers(kyc: Record<string, unknown>): Record<string, unknown> {
  const out = { ...kyc };
  for (const field of KYC_DOCUMENT_FIELDS) {
    const value = out[field];
    if (typeof value === 'string' && (value.startsWith('queued:') || value.startsWith('file:'))) {
      delete out[field];
    }
  }
  return out;
}

async function resolveClientRemoteId(
  database: SQLite.SQLiteDatabase,
  clientRef: string | number
): Promise<number> {
  const ref = String(clientRef);
  if (ref.startsWith('local-')) {
    const row = await database.getFirstAsync<{ remote_id: number | null }>(
      'SELECT remote_id FROM clients WHERE id = ?',
      [ref]
    );
    if (row?.remote_id != null) return row.remote_id;
    throw new Error('Client not yet synced to server');
  }
  const numeric = parseInt(ref, 10);
  if (!Number.isNaN(numeric)) {
    const row = await database.getFirstAsync<{ remote_id: number | null }>(
      'SELECT remote_id FROM clients WHERE id = ? OR remote_id = ?',
      [ref, numeric]
    );
    if (row?.remote_id != null) return row.remote_id;
    return numeric;
  }
  throw new Error(`Invalid client reference: ${ref}`);
}

export async function getFailedSyncCount(): Promise<number> {
  try {
    const database = await getDb();
    const q = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_queue WHERE last_error IS NOT NULL AND sync_status IN ('failed', 'conflict')"
    );
    const r = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM pending_repayments WHERE sync_status = 'failed'"
    );
    return (q?.count ?? 0) + (r?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function getPendingSyncCount(): Promise<number> {
  // Counted first: self-registrations are queued before any account exists.
  const portalCount = await sqlite.sqliteCountPendingPortalRegistrations();
  try {
    const database = await getDb();
    let queueCount = 0;
    let repayCount = 0;
    let orphanAppCount = 0;
    try {
      const q = await database.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM sync_queue WHERE sync_status = 'pending' OR sync_status IS NULL"
      );
      queueCount = q?.count ?? 0;
    } catch { /* table may not exist */ }
    try {
      const r = await database.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM pending_repayments WHERE sync_status = 'pending'"
      );
      repayCount = r?.count ?? 0;
    } catch { /* table may not exist */ }
    try {
      const orphans = await listOrphanPendingApplications(database);
      orphanAppCount = orphans.length;
      if (orphanAppCount > 0) {
        await repairPendingSyncState();
        const q2 = await database.getFirstAsync<{ count: number }>(
          "SELECT COUNT(*) as count FROM sync_queue WHERE sync_status = 'pending' OR sync_status IS NULL"
        );
        queueCount = q2?.count ?? queueCount;
        orphanAppCount = (await listOrphanPendingApplications(database)).length;
      }
    } catch { /* ignore */ }
    return portalCount + queueCount + repayCount + orphanAppCount;
  } catch {
    return portalCount;
  }
}

function formatQueueLabel(operation: string, payload: Record<string, unknown>): string {
  switch (operation) {
    case 'CREATE_PORTAL_INDIVIDUAL':
      return `Borrower registration: ${String(payload.email ?? 'individual')}`;
    case 'CREATE_PORTAL_GROUP':
      return `Group registration: ${String(payload.email ?? payload.organization_name ?? 'group')}`;
    case 'CREATE_KYC_UPLOAD':
      return `KYC document: ${String(payload.field ?? 'upload').replace(/_/g, ' ')}`;
    case 'CREATE_CLIENT':
      return `New client: ${String(payload.name ?? payload.full_name ?? payload.client_id ?? 'client')}`;
    case 'UPDATE_CLIENT_KYC':
      return `Client KYC: ${String(payload.full_name ?? 'profile update')}`;
    case 'SAVE_CLIENT_KYC':
      return 'Your KYC details';
    case 'UPDATE_CLIENT':
      return 'Client profile update';
    case 'ADD_APPLICATION_COLLATERAL':
      return 'Loan collateral';
    case 'ADD_APPLICATION_GUARANTOR':
      return 'Loan guarantor';
    case 'ATTACH_VAULT_COLLATERAL':
      return 'Attach saved collateral';
    case 'ATTACH_CATALOG_GUARANTOR':
      return 'Attach saved guarantor';
    case 'VERIFY_CLIENT':
      return 'Client verification';
    case 'APPLICATION_ACTION':
      return `Application: ${String(payload.action ?? 'action').replace(/_/g, ' ')}`;
    case 'CREATE_CLIENT_DEPOSIT':
      return 'Savings deposit';
    case 'CREATE_CLIENT_WITHDRAWAL':
      return 'Savings withdrawal';
    case 'CREATE_CLIENT_TRANSFER':
      return 'Account transfer';
    case 'FUND_CLIENT_COLLATERAL':
      return 'Cash collateral funding';
    case 'CREATE_CUSTOMER_REPAYMENT':
      return 'Borrower repayment';
    case 'CREATE_COLLECTION_CASE':
      return 'Collection case';
    case 'CREATE_COLLECTION_ACTIVITY':
      return 'Collection activity';
    case 'RESOLVE_COLLECTION_CASE':
      return 'Resolve collection case';
    case 'ASSIGN_COLLECTION_CASE':
      return 'Assign collection case';
    case 'CREATE_GROUP_MEMBER': {
      const member = payload.member as Record<string, unknown> | undefined;
      return `Group member: ${String(member?.full_name ?? member?.name ?? 'member')}`;
    }
    case 'CREATE_APPLICATION':
      return `Loan application: ${String(payload.application_number ?? 'application')}`;
    case 'UPDATE_APPLICATION':
      return `Application update: ${String(payload.application_number ?? payload.status ?? 'update')}`;
    case 'ORIGINATION_TRANSITION':
      return `Workflow: ${String(payload.action ?? 'transition').replace(/_/g, ' ').toLowerCase()}`;
    default:
      return operation.replace(/_/g, ' ').toLowerCase();
  }
}

export async function getSyncQueueSummary(): Promise<SyncQueueSummaryItem[]> {
  const items: SyncQueueSummaryItem[] = [];

  // Pre-login self-registrations live in the shared database.
  for (const row of await sqlite.sqliteGetPortalQueueRows(['pending', 'failed', 'conflict'])) {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(row.payload) as Record<string, unknown>;
    } catch { /* ignore */ }
    items.push({
      id: row.id,
      kind: 'queue',
      operation: row.operation,
      label: formatQueueLabel(row.operation, payload),
      status:
        row.sync_status === 'failed' || row.sync_status === 'conflict'
          ? row.sync_status
          : 'pending',
      createdAt: row.created_at,
      lastError: row.last_error,
      entityLocalId: String(row.entity_local_id),
    });
  }

  try {
    const database = await getDb();
    const queueRows = await database.getAllAsync<SyncQueueRow & { sync_status?: string | null }>(
      `SELECT id, operation, entity_type, entity_local_id, payload, created_at, retry_count, last_error, sync_status
       FROM sync_queue
       WHERE sync_status IN ('pending', 'failed', 'conflict') OR sync_status IS NULL
       ORDER BY id ASC`
    );
    for (const row of queueRows) {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(row.payload) as Record<string, unknown>;
      } catch { /* ignore */ }
      const status =
        row.sync_status === 'failed' || row.sync_status === 'conflict'
          ? row.sync_status
          : 'pending';
      items.push({
        id: row.id,
        kind: 'queue',
        operation: row.operation,
        label: formatQueueLabel(row.operation, payload),
        status,
        createdAt: row.created_at,
        lastError: row.last_error,
        entityLocalId: String(row.entity_local_id),
      });
    }

    const repayments = await database.getAllAsync<{
      id: number;
      loan_id: number;
      amount: number;
      sync_status: string;
      created_at?: string;
    }>(
      "SELECT id, loan_id, amount, sync_status, created_at FROM pending_repayments WHERE sync_status IN ('pending', 'failed')"
    );
    for (const pr of repayments) {
      const major = (pr.amount / 100).toLocaleString('en-MW', { maximumFractionDigits: 0 });
      items.push({
        id: pr.id,
        kind: 'repayment',
        operation: 'CREATE_REPAYMENT',
        label: `Repayment: MWK ${major} (loan #${pr.loan_id})`,
        status: pr.sync_status === 'failed' ? 'failed' : 'pending',
        createdAt: pr.created_at ?? '',
        lastError: null,
        entityLocalId: String(pr.id),
      });
    }

    const orphans = await listOrphanPendingApplications(database);
    for (const app of orphans) {
      items.push({
        id: app.id,
        kind: 'application',
        operation: 'CREATE_APPLICATION',
        label: `Loan application: ${app.application_number}`,
        status: app.sync_status === 'failed' ? 'failed' : 'pending',
        createdAt: app.created_at ?? '',
        lastError:
          app.sync_status === 'failed'
            ? 'Missing from sync queue — tap to repair and retry'
            : 'Queued locally — tap to repair and upload',
        entityLocalId: String(app.id),
        orphaned: true,
      });
    }
  } catch {
    return [];
  }
  return items;
}

export async function getPortalRegistrationReady(): Promise<PortalRegistrationReady | null> {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const raw = await AsyncStorage.getItem(PORTAL_REGISTRATION_READY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PortalRegistrationReady;
  } catch {
    return null;
  }
}

export async function consumePortalRegistrationReady(): Promise<PortalRegistrationReady | null> {
  const ready = await getPortalRegistrationReady();
  if (!ready) return null;
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.removeItem(PORTAL_REGISTRATION_READY_KEY);
  } catch { /* ignore */ }
  return ready;
}

async function storePortalRegistrationReady(result: PortalRegistrationReady): Promise<void> {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(PORTAL_REGISTRATION_READY_KEY, JSON.stringify(result));
  } catch { /* ignore */ }
}

async function processPortalQueueItem(item: SyncQueueRow): Promise<void> {
  const payload = JSON.parse(item.payload) as Record<string, unknown>;

  if (item.operation === 'CREATE_PORTAL_INDIVIDUAL') {
    const p = payload as unknown as PortalIndividualRegisterPayload;
    const tokenRes = await registerPortalIndividual(p);
    await storePortalRegistrationReady({
      // Village borrowers register without an email address.
      email: (p.email ?? '').trim(),
      fullName: p.full_name.trim(),
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
    });
    return;
  }

  if (item.operation === 'CREATE_PORTAL_GROUP') {
    const p = payload as unknown as PortalGroupRegisterPayload;
    const tokenRes = await registerPortalGroup(p);
    await storePortalRegistrationReady({
      email: (p.email ?? '').trim(),
      fullName: p.organization_name.trim(),
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
    });
    return;
  }

  throw new Error(`Not a portal operation: ${item.operation}`);
}

/**
 * Drain queued self-registrations. These live in the shared database because
 * sign-up happens before there is an account scope, so this runs without a
 * session and without the account-scoped database.
 */
async function syncPortalRegistrations(): Promise<{ synced: number; failed: number }> {
  if (!(await syncNetworkOnline())) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  await sqlite.sqliteRequeueFailedPortalRegistrations();
  const pending = await sqlite.sqliteGetPortalQueueRows(['pending']);

  for (const item of pending) {
    try {
      await processPortalQueueItem({
        ...item,
        operation: item.operation as SyncOperation,
        entity_type: 'portal_registration',
      } as SyncQueueRow);
      await sqlite.sqliteDeletePortalQueueRow(item.id);
      synced++;
    } catch (e) {
      failed++;
      const errMsg = e instanceof Error ? e.message : String(e);
      const isConflict = /conflict|already exists|duplicate|modified/i.test(errMsg);
      await sqlite.sqliteMarkPortalQueueRowFailed(
        item.id,
        errMsg,
        isConflict ? 'conflict' : 'failed'
      );
    }
  }
  return { synced, failed };
}

/** Soft-reset failed rows so auto/manual sync can re-attempt in sequence. */
async function requeueFailedForRetry(database: SQLite.SQLiteDatabase): Promise<void> {
  try {
    await database.runAsync(
      "UPDATE sync_queue SET sync_status = 'pending' WHERE sync_status = 'failed' AND retry_count < 20"
    );
    await database.runAsync(
      "UPDATE pending_repayments SET sync_status = 'pending' WHERE sync_status = 'failed'"
    );
  } catch {
    /* tables may not exist */
  }
}

/** Run sync when device is online (safe to call after offline writes). */
export async function runSyncIfOnline(options?: {
  forceNetworkCheck?: boolean;
  /** Force-requeue failed/conflict rows before draining (manual Sync now). */
  retryFailed?: boolean;
}): Promise<SyncRunResult> {
  const online = await syncNetworkOnline(options?.forceNetworkCheck ?? false);
  if (!online) {
    return { synced: 0, failed: 0, skipped: true, offline: true };
  }
  try {
    if (options?.retryFailed) {
      try {
        const database = await getDb();
        await database.runAsync(
          "UPDATE sync_queue SET sync_status = 'pending', last_error = NULL WHERE sync_status IN ('failed', 'conflict')"
        );
        await database.runAsync(
          "UPDATE pending_repayments SET sync_status = 'pending' WHERE sync_status = 'failed'"
        );
        await database.runAsync(
          "UPDATE applications SET sync_status = 'pending' WHERE sync_status = 'failed'"
        );
      } catch {
        /* tables may not exist */
      }
    }
    await repairPendingSyncState();
    return await runSync();
  } catch (error) {
    logger.error(
      'Sync run failed',
      error instanceof Error ? error : new Error(String(error)),
      { module: 'sync-service' }
    );
    return { synced: 0, failed: 0 };
  }
}

/** @deprecated Prefer runSyncIfOnline — kept for existing call sites. */
export async function tryRunSyncIfOnline(): Promise<void> {
  await runSyncIfOnline({ forceNetworkCheck: true, retryFailed: true });
}

async function syncPendingRepayments(
  database: SQLite.SQLiteDatabase,
  token: string
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  const pendingRepayments = await database.getAllAsync<{
    id: number;
    loan_id: number;
    client_id: number;
    amount: number;
    principal_amount: number;
    interest_amount: number;
    client_reference: string | null;
  }>(
    "SELECT id, loan_id, client_id, amount, principal_amount, interest_amount, client_reference FROM pending_repayments WHERE sync_status = 'pending'"
  );

  for (const pr of pendingRepayments) {
    try {
      await api.apiCreateRepayment(
        token,
        pr.loan_id,
        pr.client_id,
        pr.amount,
        pr.principal_amount,
        pr.interest_amount,
        undefined,
        pr.client_reference ?? undefined
      );
      await database.runAsync('UPDATE pending_repayments SET sync_status = ? WHERE id = ?', 'synced', pr.id);
      synced++;
    } catch {
      await database.runAsync('UPDATE pending_repayments SET sync_status = ? WHERE id = ?', 'failed', pr.id);
      failed++;
    }
  }
  return { synced, failed };
}

async function processQueueItem(
  database: SQLite.SQLiteDatabase,
  token: string,
  item: SyncQueueRow
): Promise<void> {
  const payload = JSON.parse(item.payload) as Record<string, unknown>;
  const localId = item.entity_local_id;

  if (item.operation === 'CREATE_KYC_UPLOAD') {
    const field = payload.field as KycUploadField;
    const localUri = String(payload.local_uri);
    const fileName = String(payload.file_name ?? 'kyc.jpg');
    const uploaded = await uploadMobileKycDocument(token, localUri, field, fileName);
    await storeKycUploadResult(field, uploaded.path);
    // Persist the uploaded path on the server KYC record so staff can see it
    // even if the borrower doesn't reopen/resubmit the KYC form.
    try {
      const { fetchMobileKyc, saveMobileKyc } = await import('@/lib/client-portal/api');
      const current = await fetchMobileKyc(token);
      await saveMobileKyc(token, { ...current, [field]: uploaded.path });
    } catch {
      /* non-fatal — path is retained locally for next KYC form open/submit */
    }
    return;
  }

  if (item.operation === 'SAVE_CLIENT_KYC') {
    const { fetchMobileKyc, saveMobileKyc } = await import('@/lib/client-portal/api');
    const queued = (payload.kyc ?? {}) as Record<string, unknown>;
    // Documents uploaded ahead of this row replaced their local URIs with
    // server paths, so merge the queued answers over the current record
    // instead of overwriting paths with stale `queued:` markers.
    let merged: Record<string, unknown> = queued;
    try {
      const current = (await fetchMobileKyc(token)) as Record<string, unknown>;
      merged = { ...current, ...stripQueuedDocumentMarkers(queued) };
    } catch {
      merged = stripQueuedDocumentMarkers(queued);
    }
    await saveMobileKyc(token, merged as Parameters<typeof saveMobileKyc>[1]);
    return;
  }

  if (item.operation === 'CREATE_CLIENT') {
    const profile = await api.apiGetStaffProfile(token);
    if (profile.branch_id == null) {
      throw new Error('Staff profile has no branch — cannot sync client creation.');
    }
    if (profile.bank_id == null || Number(profile.bank_id) <= 0) {
      throw new Error('Staff profile has no bank — cannot sync client creation.');
    }
    const created = await api.apiSyncCreateClient(token, {
      bank_id: Number(profile.bank_id),
      branch_id: profile.branch_id,
      client_id: String(payload.client_id),
      password: String(payload.password),
      full_name: String(payload.name ?? payload.full_name),
      national_id: (payload.national_id as string) ?? null,
      email: (payload.email as string) ?? null,
      phone_number: (payload.phone_number as string) ?? null,
      address: (payload.address as string) ?? null,
      client_type: (payload.client_type as string) ?? 'INDIVIDUAL',
    });
    if (payload.business_location && created?.id) {
      try {
        await api.apiSetClientBusinessLocation(
          token,
          Number(created.remote_id ?? created.id),
          payload.business_location as GeolocationInput
        );
      } catch { /* optional */ }
    }
    await database.runAsync(
      'UPDATE clients SET remote_id = ?, sync_status = ? WHERE id = ?',
      Number.parseInt(String(created.id), 10),
      'synced',
      localId
    );
    return;
  }

  if (item.operation === 'UPDATE_CLIENT') {
    const remoteId = await resolveClientRemoteId(database, localId);
    await api.apiUpdateClient(
      token,
      String(remoteId),
      payload.updates as Parameters<typeof api.apiUpdateClient>[2]
    );
    await database.runAsync(
      'UPDATE clients SET sync_status = ? WHERE id = ?',
      'synced',
      localId
    );
    return;
  }

  if (item.operation === 'VERIFY_CLIENT') {
    const remoteId = await resolveClientRemoteId(database, localId);
    const localRow = await database.getFirstAsync<{
      name?: string | null;
      client_type?: string | null;
      group_constitution_uri?: string | null;
    }>('SELECT name, client_type, group_constitution_uri FROM clients WHERE id = ?', localId);
    const { verifyStaffClientWithOrgKycGuard } = await import('@/lib/staff/client-kyc-update');
    await verifyStaffClientWithOrgKycGuard(token, String(remoteId), {
      name: localRow?.name,
      client_type: localRow?.client_type,
      group_constitution_uri: localRow?.group_constitution_uri,
    });
    return;
  }

  if (item.operation === 'APPLICATION_ACTION') {
    const remoteId = await resolveApplicationRemoteId(
      database,
      (payload.application_ref as string | number) ?? localId
    );
    const action = String(payload.action);
    if (action === 'submit_for_approval') {
      await api.apiSubmitApplicationForApproval(token, remoteId);
      return;
    }
    if (action === 'submit_to_loan_officer') {
      await api.apiSubmitApplicationToLoanOfficer(token, remoteId);
      return;
    }
    if (action === 'withdraw') {
      await api.apiWithdrawLoanApplication(token, remoteId);
      return;
    }
    throw new Error(`Unknown application action: ${action}`);
  }

  if (item.operation === 'UPDATE_CLIENT_KYC') {
    const remoteId = await resolveClientRemoteId(database, localId);
    const kyc = (payload.kyc as import('@/lib/client-portal/kyc-completion-calculator').ClientKYCData) ?? {};
    const localPreviews =
      (payload.local_previews as Partial<
        Record<import('@/lib/client-portal/api').KycUploadField, string>
      >) ?? {};
    const { applyStaffClientKycUpdate } = await import('@/lib/staff/client-kyc-update');
    await applyStaffClientKycUpdate(
      token,
      String(remoteId),
      kyc,
      localPreviews,
      {
        saveMode: (payload.save_mode as 'draft' | 'finished') ?? 'draft',
        districtId: payload.district_id as number | null | undefined,
        clientType: String(payload.client_type ?? 'INDIVIDUAL'),
        fullName: String(payload.full_name ?? ''),
      }
    );
    await database.runAsync(
      'UPDATE clients SET sync_status = ? WHERE id = ?',
      'synced',
      localId
    );
    return;
  }

  if (item.operation === 'CREATE_GROUP_MEMBER') {
    const groupParentId = await resolveClientRemoteId(
      database,
      payload.group_parent_id as string | number
    );
    const member = payload.member as GroupMemberCreateInput;
    const created = await api.apiAddGroupMember(token, groupParentId, member);
    await database.runAsync(
      'UPDATE clients SET remote_id = ?, sync_status = ? WHERE id = ?',
      Number.parseInt(String(created.id), 10),
      'synced',
      localId
    );
    return;
  }

  if (item.operation === 'CREATE_APPLICATION') {
    const localAppId = Number(localId);
    if (Number.isFinite(localAppId)) {
      const localApp = await database.getFirstAsync<{ remote_id: number | null; sync_status: string | null }>(
        'SELECT remote_id, sync_status FROM applications WHERE id = ?',
        localAppId
      );
      if (localApp?.remote_id != null) {
        // Already pushed — treat as success (idempotent).
        await database.runAsync(
          "UPDATE applications SET sync_status = 'synced' WHERE id = ?",
          localAppId
        );
        return;
      }
    }

    const { pushLoanApplicationToRemote } = await import('@/lib/sync/push-application');
    const created = await pushLoanApplicationToRemote(
      token,
      {
        ...(payload as unknown as import('@/lib/sync/push-application').ApplicationPushPayload),
        client_reference:
          (payload.client_reference as string | undefined) ||
          (payload.application_number as string | undefined),
      },
      {
        database,
        requireOnlineForGroupAllocation: true,
        isOnline: () => syncNetworkOnline(true),
      }
    );
    await database.runAsync(
      'UPDATE applications SET remote_id = ?, sync_status = ?, application_number = COALESCE(?, application_number) WHERE id = ?',
      created.id,
      'synced',
      created.application_number ?? null,
      localId
    );
    return;
  }

  if (item.operation === 'UPDATE_APPLICATION') {
    const remoteId =
      (payload.remote_id as number) ?? (await getRemoteId(database, 'applications', Number(localId)));
    if (!remoteId) {
      throw new Error('Application not yet synced; create will sync first');
    }
    if (payload.status === 'APPROVED') {
      await api.apiApproveApplication(
        token,
        remoteId,
        payload.approved_amount as number,
        payload.approved_term_months as number
      );
    } else if (payload.status === 'REJECTED') {
      await api.apiRejectApplication(token, remoteId, payload.rejection_reason as string);
    } else if (payload.status === 'DISBURSED') {
      await api.apiDisburseApplication(token, remoteId);
    } else if (payload._mobile_draft === true) {
      await api.apiUpdateMobileLoanApplication(token, remoteId, {
        requested_amount:
          payload.requested_amount != null ? Number(payload.requested_amount) : undefined,
        requested_term_months:
          payload.requested_term_months != null
            ? Number(payload.requested_term_months)
            : undefined,
        purpose: payload.purpose != null ? String(payload.purpose) : undefined,
      });
    } else {
      await api.apiUpdateApplication(token, remoteId, payload);
    }
    const localAppId = Number(localId);
    if (Number.isFinite(localAppId)) {
      await database.runAsync(
        'UPDATE applications SET sync_status = ? WHERE id = ?',
        'synced',
        localAppId
      );
    }
    return;
  }

  if (item.operation === 'DELETE_APPLICATION') {
    const remoteId =
      (payload.remote_id as number) ??
      (await getRemoteId(database, 'applications', Number(localId)));
    if (!remoteId) {
      // Already gone locally with no remote — treat as success.
      return;
    }
    try {
      await api.apiDeleteMobileLoanApplication(token, remoteId);
    } catch (e) {
      if (e instanceof ApiClientError && (e.status === 404 || e.status === 400)) {
        return;
      }
      throw e;
    }
    return;
  }

  if (item.operation === 'ORIGINATION_TRANSITION') {
    let remoteId = payload.remote_id as number | undefined;
    if (!remoteId) {
      remoteId =
        (await getRemoteId(database, 'applications', Number(payload.local_application_id ?? localId))) ??
        undefined;
    }
    if (!remoteId) {
      throw new Error('Application not yet synced; complete client/member sync first');
    }
    await api.apiPostOriginationTransition(token, remoteId, {
      action: String(payload.action),
      reason: payload.reason as string | undefined,
      approved_amount: payload.approved_amount as number | undefined,
      approved_term_months: payload.approved_term_months as number | undefined,
      interest_rate: payload.interest_rate as number | undefined,
    });
    return;
  }

  if (item.operation === 'ADD_APPLICATION_COLLATERAL') {
    // Each attachment gets its own queue row, so the application it belongs to
    // travels in the payload rather than in entity_local_id.
    const remoteId = await resolveApplicationRemoteId(
      database,
      (payload.application_ref as string | number) ?? localId
    );
    const audience = payload.audience === 'client' ? 'client' : 'staff';
    const body = (payload.collateral ?? {}) as Record<string, unknown>;
    const documents = payload.documents as
      | Array<{ uri: string; name: string; docType: string }>
      | undefined;
    const geolocation = payload.geolocation as GeolocationInput | undefined;
    const documentKeys = await uploadQueuedCollateralDocuments(token, documents, audience);

    if (audience === 'client') {
      const created = await api.apiAddBorrowerApplicationCollateral(token, remoteId, {
        ...(body as Parameters<typeof api.apiAddBorrowerApplicationCollateral>[2]),
        document_keys: documentKeys,
      });
      if (geolocation && created?.id) {
        try {
          await api.apiUpdateBorrowerApplicationCollateral(token, remoteId, created.id, {
            geolocation,
          });
        } catch { /* collateral is saved; location can be tagged later */ }
      }
      return;
    }

    const created = await api.apiAddApplicationCollateral(token, remoteId, {
      ...(body as Parameters<typeof api.apiAddApplicationCollateral>[2]),
      document_keys: documentKeys,
    });
    if (geolocation && created?.id) {
      try {
        await api.apiSetApplicationCollateralLocation(token, remoteId, created.id, geolocation);
      } catch { /* collateral is saved; location can be tagged later */ }
    }
    return;
  }

  if (item.operation === 'ADD_APPLICATION_GUARANTOR') {
    const remoteId = await resolveApplicationRemoteId(
      database,
      (payload.application_ref as string | number) ?? localId
    );
    const guarantor = (payload.guarantor ?? {}) as Parameters<
      typeof api.apiAddApplicationGuarantor
    >[2];
    if (payload.audience === 'client') {
      await api.apiAddBorrowerApplicationGuarantor(
        token,
        remoteId,
        guarantor as Parameters<typeof api.apiAddBorrowerApplicationGuarantor>[2]
      );
      return;
    }
    await api.apiAddApplicationGuarantor(token, remoteId, guarantor);
    return;
  }

  if (item.operation === 'ATTACH_VAULT_COLLATERAL') {
    const remoteId = await resolveApplicationRemoteId(
      database,
      (payload.application_ref as string | number) ?? localId
    );
    const collateralId = Number(payload.collateral_id);
    if (!Number.isFinite(collateralId) || collateralId <= 0) {
      throw new Error('Missing vault collateral id');
    }
    await api.apiAttachBorrowerVaultCollateralToApplication(token, collateralId, remoteId);
    return;
  }

  if (item.operation === 'ATTACH_CATALOG_GUARANTOR') {
    const remoteId = await resolveApplicationRemoteId(
      database,
      (payload.application_ref as string | number) ?? localId
    );
    const guarantorId = Number(payload.guarantor_id);
    if (!Number.isFinite(guarantorId) || guarantorId <= 0) {
      throw new Error('Missing catalog guarantor id');
    }
    await api.apiAttachBorrowerCatalogGuarantorToApplication(token, guarantorId, remoteId);
    return;
  }

  if (item.operation === 'CREATE_CLIENT_DEPOSIT') {
    const accountsApi = await import('@/lib/data/accounts-api');
    let receipt_path =
      typeof payload.receipt_path === 'string' ? payload.receipt_path : undefined;
    if (!receipt_path && typeof payload.receipt_local_uri === 'string') {
      const { uploadCollateralDocument } = await import('@/lib/data/mediaService');
      const uploaded = await uploadCollateralDocument(payload.receipt_local_uri, token, {
        fileName:
          typeof payload.receipt_file_name === 'string' ? payload.receipt_file_name : undefined,
        audience: 'client',
        prefix: 'client-deposit-receipts',
      });
      receipt_path = uploaded.url || uploaded.key;
    }
    await accountsApi.apiCreateAndSubmitDeposit(token, {
      account_id: Number(payload.account_id),
      amount_minor: Number(payload.amount_minor),
      deposit_method:
        typeof payload.deposit_method === 'string' ? payload.deposit_method : undefined,
      reference_number:
        typeof payload.reference_number === 'string' ? payload.reference_number : undefined,
      notes: typeof payload.notes === 'string' ? payload.notes : undefined,
      receipt_path,
      receipt_metadata:
        payload.receipt_metadata && typeof payload.receipt_metadata === 'object'
          ? (payload.receipt_metadata as Record<string, unknown>)
          : undefined,
    });
    return;
  }

  if (item.operation === 'CREATE_CLIENT_WITHDRAWAL') {
    const accountsApi = await import('@/lib/data/accounts-api');
    await accountsApi.apiCreateAndSubmitWithdrawal(token, {
      account_id: Number(payload.account_id),
      amount_minor: Number(payload.amount_minor),
      withdrawal_method:
        typeof payload.withdrawal_method === 'string' ? payload.withdrawal_method : undefined,
      reference_number:
        typeof payload.reference_number === 'string' ? payload.reference_number : undefined,
      notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    });
    return;
  }

  if (item.operation === 'CREATE_CLIENT_TRANSFER') {
    const accountsApi = await import('@/lib/data/accounts-api');
    await accountsApi.apiCreateAndSubmitTransfer(token, {
      source_account_id: Number(payload.source_account_id),
      destination_account_id: Number(payload.destination_account_id),
      amount_minor: Number(payload.amount_minor),
      transfer_purpose:
        typeof payload.transfer_purpose === 'string' ? payload.transfer_purpose : undefined,
      loan_id:
        payload.loan_id != null && Number.isFinite(Number(payload.loan_id))
          ? Number(payload.loan_id)
          : undefined,
      notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    });
    return;
  }

  if (item.operation === 'FUND_CLIENT_COLLATERAL') {
    const accountsApi = await import('@/lib/data/accounts-api');
    await accountsApi.apiFundMobileCollateral(token, {
      source_account_id: Number(payload.source_account_id),
      amount_minor: Number(payload.amount_minor),
    });
    return;
  }

  if (item.operation === 'CREATE_CUSTOMER_REPAYMENT') {
    const customerApi = await import('@/lib/data/api');
    let deposit_receipt_url =
      typeof payload.deposit_receipt_url === 'string' ? payload.deposit_receipt_url : undefined;
    if (!deposit_receipt_url && typeof payload.receipt_local_uri === 'string') {
      const { uploadCollateralDocument } = await import('@/lib/data/mediaService');
      const uploaded = await uploadCollateralDocument(payload.receipt_local_uri, token, {
        fileName:
          typeof payload.receipt_file_name === 'string' ? payload.receipt_file_name : undefined,
        audience: 'client',
        prefix:
          typeof payload.receipt_prefix === 'string' ? payload.receipt_prefix : 'client-receipts',
      });
      deposit_receipt_url = uploaded.url || uploaded.key;
    }
    await customerApi.apiCreateCustomerRepayment(token, {
      loan_id: Number(payload.loan_id),
      amount_minor: Number(payload.amount_minor),
      payment_method:
        typeof payload.payment_method === 'string' ? payload.payment_method : undefined,
      deposit_receipt_number:
        typeof payload.deposit_receipt_number === 'string'
          ? payload.deposit_receipt_number
          : undefined,
      deposit_receipt_url,
      reference_number:
        typeof payload.reference_number === 'string' ? payload.reference_number : undefined,
      payment_date: typeof payload.payment_date === 'string' ? payload.payment_date : undefined,
      selected_installment_ids: Array.isArray(payload.selected_installment_ids)
        ? (payload.selected_installment_ids as number[])
        : undefined,
      installment_allocation_plan:
        payload.installment_allocation_plan &&
        typeof payload.installment_allocation_plan === 'object'
          ? (payload.installment_allocation_plan as Record<string, unknown>)
          : undefined,
      recorded_by_member_id:
        payload.recorded_by_member_id != null &&
        Number.isFinite(Number(payload.recorded_by_member_id))
          ? Number(payload.recorded_by_member_id)
          : undefined,
    });
    return;
  }

  if (item.operation === 'CREATE_COLLECTION_CASE') {
    const collectionsApi = await import('@/lib/data/collections-api');
    await collectionsApi.apiCreateCollectionCase(token, {
      loan_id: Number(payload.loan_id),
      client_id:
        payload.client_id != null && Number.isFinite(Number(payload.client_id))
          ? Number(payload.client_id)
          : undefined,
      priority: typeof payload.priority === 'string' ? payload.priority : undefined,
      notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    });
    return;
  }

  if (item.operation === 'CREATE_COLLECTION_ACTIVITY') {
    const collectionsApi = await import('@/lib/data/collections-api');
    const caseId = Number(payload.case_id);
    if (!Number.isFinite(caseId) || caseId <= 0) {
      throw new Error('Missing collection case id for activity sync');
    }
    await collectionsApi.apiCreateCollectionActivity(token, caseId, {
      activity_type: String(payload.activity_type ?? 'CALL'),
      description: String(payload.description ?? ''),
      created_by: Number(payload.created_by),
    });
    return;
  }

  if (item.operation === 'RESOLVE_COLLECTION_CASE') {
    const collectionsApi = await import('@/lib/data/collections-api');
    const caseId = Number(payload.case_id);
    if (!Number.isFinite(caseId) || caseId <= 0) {
      throw new Error('Missing collection case id for resolve sync');
    }
    await collectionsApi.apiResolveCollectionCase(token, caseId, {
      resolution_outcome: String(payload.resolution_outcome ?? ''),
      notes: typeof payload.notes === 'string' ? payload.notes : undefined,
      settlement_amount:
        payload.settlement_amount != null && Number.isFinite(Number(payload.settlement_amount))
          ? Number(payload.settlement_amount)
          : undefined,
    });
    return;
  }

  if (item.operation === 'ASSIGN_COLLECTION_CASE') {
    const collectionsApi = await import('@/lib/data/collections-api');
    const caseId = Number(payload.case_id);
    const collectorId = Number(payload.collector_id);
    if (!Number.isFinite(caseId) || caseId <= 0) {
      throw new Error('Missing collection case id for assign sync');
    }
    if (!Number.isFinite(collectorId) || collectorId <= 0) {
      throw new Error('Missing collector id for assign sync');
    }
    await collectionsApi.apiAssignCollectionCase(token, caseId, collectorId);
    return;
  }

  throw new Error(`Unknown sync operation: ${item.operation}`);
}

let activeSyncPromise: Promise<SyncRunResult> | null = null;

export async function runSync(): Promise<SyncRunResult> {
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = (async (): Promise<SyncRunResult> => {
    syncInProgress = true;
    notifySyncActivity(true);
    let synced = 0;
    let failed = 0;

    try {
      beginSyncAuthGuard();

      // Self-registration is queued before anyone signs in, so it drains first
      // and needs neither a session nor the account-scoped database.
      const portalResult = await syncPortalRegistrations();
      synced += portalResult.synced;
      failed += portalResult.failed;

      // Everything below belongs to a signed-in account.
      let database: SQLite.SQLiteDatabase;
      try {
        database = await getDb();
      } catch {
        const { token: liveToken, hasUser } = readLiveAuthCredentials();
        return { synced, failed, noAuth: !liveToken && !hasUser };
      }

      const repaired = await repairPendingSyncState();
      // Auto-retry previously failed uploads (capped) so 15s polling actually drains the queue.
      await requeueFailedForRetry(database);

      const token = await resolveSyncAuthToken();
      if (!token) {
        const { token: liveToken, hasUser } = readLiveAuthCredentials();
        return {
          synced,
          failed,
          repaired,
          noAuth: !liveToken && !hasUser,
        };
      }

      const repaymentResult = await syncPendingRepayments(database, token);
      synced += repaymentResult.synced;
      failed += repaymentResult.failed;

      const pending = sortQueueRows(
        await database.getAllAsync<SyncQueueRow>(
          `SELECT * FROM sync_queue
           WHERE sync_status IN ('pending', 'failed') OR sync_status IS NULL
           ORDER BY id ASC`
        )
      ).filter((item) => !isPortalOperation(item.operation));

      let deferred = 0;
      for (const item of pending) {
        try {
          await processQueueItem(database, token, item);
          await database.runAsync('DELETE FROM sync_queue WHERE id = ?', item.id);
          synced++;
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          if (isOfflineDeferredError(errMsg)) {
            deferred++;
            continue;
          }
          failed++;
          const isConflict =
            (e instanceof ApiClientError && (e.status === 409 || e.status === 422)) ||
            /conflict|already exists|duplicate|modified/i.test(errMsg);
          const syncStatus = isConflict ? 'conflict' : 'failed';
          await database.runAsync(
            'UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ?, sync_status = ? WHERE id = ?',
            errMsg,
            syncStatus,
            item.id
          );
          if (item.operation === 'CREATE_APPLICATION') {
            await database.runAsync(
              "UPDATE applications SET sync_status = 'failed' WHERE id = ?",
              item.entity_local_id
            );
          } else if (item.operation === 'CREATE_CLIENT' || item.operation === 'CREATE_GROUP_MEMBER') {
            await database.runAsync(
              "UPDATE clients SET sync_status = 'failed' WHERE id = ?",
              item.entity_local_id
            );
          }
        }
      }

      return { synced, failed, repaired, deferred };
    } finally {
      endSyncAuthGuard();
      syncInProgress = false;
      notifySyncActivity(false);
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

export async function retryFailedSync(): Promise<{ synced: number; failed: number }> {
  try {
    const database = await getDb();
    await database.runAsync(
      "UPDATE sync_queue SET sync_status = 'pending', last_error = NULL WHERE sync_status IN ('failed', 'conflict')"
    );
    await database.runAsync(
      "UPDATE pending_repayments SET sync_status = 'pending' WHERE sync_status = 'failed'"
    );
  } catch { /* tables may not exist */ }
  return runSync();
}

export type SyncItemDetail = SyncQueueSummaryItem & {
  payload?: Record<string, unknown>;
  retryCount?: number;
  application?: LoanApplicationRow | null;
};

export async function getSyncItemDetail(
  kind: SyncQueueSummaryItem['kind'],
  id: number
): Promise<SyncItemDetail | null> {
  const database = await getDb();
  if (kind === 'queue') {
    const row = await database.getFirstAsync<SyncQueueRow & { sync_status?: string | null }>(
      `SELECT id, operation, entity_type, entity_local_id, payload, created_at, retry_count, last_error, sync_status
       FROM sync_queue WHERE id = ?`,
      id
    );
    if (!row) return null;
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(row.payload) as Record<string, unknown>;
    } catch { /* ignore */ }
    const status =
      row.sync_status === 'failed' || row.sync_status === 'conflict' ? row.sync_status : 'pending';
    const appId = parseInt(String(row.entity_local_id), 10);
    const application =
      row.operation === 'CREATE_APPLICATION' && Number.isFinite(appId)
        ? await database.getFirstAsync<LoanApplicationRow>(
            'SELECT * FROM applications WHERE id = ?',
            appId
          )
        : null;
    return {
      id: row.id,
      kind: 'queue',
      operation: row.operation,
      label: formatQueueLabel(row.operation, payload),
      status,
      createdAt: row.created_at,
      lastError: row.last_error,
      entityLocalId: String(row.entity_local_id),
      payload,
      retryCount: row.retry_count,
      application: application ?? null,
    };
  }

  if (kind === 'repayment') {
    const row = await database.getFirstAsync<{
      id: number;
      loan_id: number;
      amount: number;
      sync_status: string;
      created_at?: string;
    }>(
      'SELECT id, loan_id, amount, sync_status, created_at FROM pending_repayments WHERE id = ?',
      id
    );
    if (!row) return null;
    const major = (row.amount / 100).toLocaleString('en-MW', { maximumFractionDigits: 0 });
    return {
      id: row.id,
      kind: 'repayment',
      operation: 'CREATE_REPAYMENT',
      label: `Repayment: MWK ${major} (loan #${row.loan_id})`,
      status: row.sync_status === 'failed' ? 'failed' : 'pending',
      createdAt: row.created_at ?? '',
      lastError: null,
      entityLocalId: String(row.id),
    };
  }

  const app = await database.getFirstAsync<LoanApplicationRow>(
    'SELECT * FROM applications WHERE id = ?',
    id
  );
  if (!app) return null;
  return {
    id: app.id,
    kind: 'application',
    operation: 'CREATE_APPLICATION',
    label: `Loan application: ${app.application_number}`,
    status: app.sync_status === 'failed' ? 'failed' : 'pending',
    createdAt: app.created_at ?? '',
    lastError:
      app.sync_status === 'failed'
        ? 'Missing from sync queue — repair then retry upload'
        : 'Saved locally — repair then upload to server',
    entityLocalId: String(app.id),
    orphaned: true,
    application: app,
    payload: buildApplicationSyncPayload(app),
  };
}

export async function retrySyncItem(item: SyncQueueSummaryItem): Promise<SyncRunResult> {
  const database = await getDb();
  if (item.kind === 'application') {
    await repairPendingSyncState();
  } else if (item.kind === 'queue') {
    await database.runAsync(
      "UPDATE sync_queue SET sync_status = 'pending', last_error = NULL WHERE id = ?",
      item.id
    );
    if (item.operation === 'CREATE_APPLICATION') {
      await database.runAsync(
        "UPDATE applications SET sync_status = 'pending' WHERE id = ?",
        item.entityLocalId
      );
    }
  } else {
    await database.runAsync(
      "UPDATE pending_repayments SET sync_status = 'pending' WHERE id = ?",
      item.id
    );
  }
  return runSyncIfOnline({ forceNetworkCheck: true });
}

export async function discardSyncItem(item: SyncQueueSummaryItem): Promise<void> {
  const database = await getDb();
  if (item.kind === 'application') {
    await database.runAsync(
      "UPDATE applications SET sync_status = 'failed' WHERE id = ?",
      item.entityLocalId
    );
    return;
  }
  if (item.kind === 'queue') {
    await database.runAsync('DELETE FROM sync_queue WHERE id = ?', item.id);
    if (item.operation === 'CREATE_APPLICATION') {
      await database.runAsync(
        "UPDATE applications SET sync_status = 'failed' WHERE id = ?",
        item.entityLocalId
      );
    } else if (item.operation === 'CREATE_CLIENT' || item.operation === 'CREATE_GROUP_MEMBER') {
      await database.runAsync(
        "UPDATE clients SET sync_status = 'failed' WHERE id = ?",
        item.entityLocalId
      );
    }
  } else {
    await database.runAsync('DELETE FROM pending_repayments WHERE id = ?', item.id);
  }
}

export async function getPendingApplicationGroupAllocation(
  localApplicationId: number
): Promise<Record<string, unknown> | undefined> {
  try {
    const database = await getDb();
    const row = await database.getFirstAsync<{ payload: string }>(
      `SELECT payload FROM sync_queue
       WHERE operation = 'CREATE_APPLICATION' AND entity_local_id = ?
       ORDER BY id DESC LIMIT 1`,
      String(localApplicationId)
    );
    if (!row) return undefined;
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const gla = payload.group_loan_allocation;
    if (gla && typeof gla === 'object' && Object.keys(gla as object).length > 0) {
      return gla as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Latest queued payload for an operation/entity, or null when nothing is queued. */
export async function readQueuedPayload(
  operation: SyncOperation,
  entityLocalId: number | string
): Promise<Record<string, unknown> | null> {
  try {
    const database = await getDb();
    const row = await database.getFirstAsync<{ payload: string }>(
      `SELECT payload FROM sync_queue
       WHERE operation = ? AND entity_local_id = ?
       ORDER BY id DESC LIMIT 1`,
      operation,
      String(entityLocalId)
    );
    return row ? (JSON.parse(row.payload) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function enqueueSync(
  operation: string,
  entityType: string,
  entityLocalId: number | string,
  payload: object
): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();
  const localId = String(entityLocalId);

  // Idempotent enqueue: one pending/failed row per operation+entity.
  const existing = await database.getFirstAsync<{ id: number }>(
    `SELECT id FROM sync_queue
     WHERE operation = ? AND entity_local_id = ?
       AND (sync_status IN ('pending', 'failed', 'conflict') OR sync_status IS NULL)
     ORDER BY id ASC LIMIT 1`,
    operation,
    localId
  );
  if (existing) {
    await database.runAsync(
      `UPDATE sync_queue
       SET payload = ?, sync_status = 'pending', last_error = NULL, created_at = ?
       WHERE id = ?`,
      JSON.stringify(payload),
      now,
      existing.id
    );
    // Drop duplicate pending rows for the same entity/operation.
    await database.runAsync(
      `DELETE FROM sync_queue
       WHERE operation = ? AND entity_local_id = ? AND id != ?
         AND (sync_status IN ('pending', 'failed', 'conflict') OR sync_status IS NULL)`,
      operation,
      localId,
      existing.id
    );
    return;
  }

  await database.runAsync(
    `INSERT INTO sync_queue (operation, entity_type, entity_local_id, payload, created_at, sync_status, retry_count)
     VALUES (?, ?, ?, ?, ?, 'pending', 0)`,
    operation,
    entityType,
    localId,
    JSON.stringify(payload),
    now
  );
}
