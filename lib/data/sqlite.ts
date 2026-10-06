/**
 * SQLite data layer – local-first storage for offline capability.
 * App data is per-account (`cofi_loan_app__{scope}.db`).
 * Offline credentials live in shared `cofi_auth_shared.db` (usable before login).
 */

import * as SQLite from 'expo-sqlite';
import { runSyncMigrations } from '@/lib/sync/schema';
import {
  requireActiveAccountScopeId,
  scopedDatabaseName,
  SHARED_AUTH_DATABASE_NAME,
} from '@/lib/account-scope';
import { USE_API } from '@/lib/config-flags';
import type { LoanApplicationRow, ClientRow } from './types';

let db: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let dbScopeId: string | null = null;

let sharedAuthDb: SQLite.SQLiteDatabase | null = null;
let sharedAuthInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Close the account-scoped connection so the next open uses the new scope file. */
export async function releaseAppDatabase(): Promise<void> {
  const current = db;
  db = null;
  dbInitPromise = null;
  dbScopeId = null;
  if (current) {
    try {
      await current.closeAsync();
    } catch {
      /* ignore close races */
    }
  }
}

/** Account-scoped DB — requires an active account scope (after login / hydrate). */
export async function getAppDatabase(): Promise<SQLite.SQLiteDatabase> {
  const scopeId = requireActiveAccountScopeId();
  if (db && dbScopeId === scopeId) return db;
  if (db && dbScopeId !== scopeId) {
    await releaseAppDatabase();
  }
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      const database = await SQLite.openDatabaseAsync(scopedDatabaseName(scopeId));
      await initSchema(database);
      await runSyncMigrations(database);
      db = database;
      dbScopeId = scopeId;
      return database;
    })().catch((error) => {
      dbInitPromise = null;
      throw error;
    });
  }
  return dbInitPromise;
}

/**
 * Shared auth DB for offline credential replicas (accessible before login).
 * One-time copies credentials from the legacy global app DB when present.
 */
export async function getSharedAuthDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (sharedAuthDb) return sharedAuthDb;
  if (!sharedAuthInitPromise) {
    sharedAuthInitPromise = (async () => {
      const database = await SQLite.openDatabaseAsync(SHARED_AUTH_DATABASE_NAME);
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS portal_sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation TEXT NOT NULL,
          entity_local_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          retry_count INTEGER DEFAULT 0,
          last_error TEXT,
          sync_status TEXT DEFAULT 'pending'
        );
        CREATE TABLE IF NOT EXISTS offline_auth_credentials (
          email_normalized TEXT PRIMARY KEY,
          role TEXT NOT NULL,
          verifier TEXT NOT NULL,
          verifier_version INTEGER NOT NULL DEFAULT 1,
          user_snapshot TEXT NOT NULL,
          last_online_auth_at TEXT NOT NULL,
          last_offline_auth_at TEXT,
          pending_server_validation INTEGER DEFAULT 0,
          stored_token TEXT,
          stored_refresh_token TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_offline_auth_pending
          ON offline_auth_credentials(pending_server_validation);
      `);
      await migrateLegacyOfflineCredentials(database);
      sharedAuthDb = database;
      return database;
    })().catch((error) => {
      sharedAuthInitPromise = null;
      throw error;
    });
  }
  return sharedAuthInitPromise;
}

async function migrateLegacyOfflineCredentials(
  shared: SQLite.SQLiteDatabase
): Promise<void> {
  try {
    const existing = await shared.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM offline_auth_credentials'
    );
    if ((existing?.c ?? 0) > 0) return;

    const legacy = await SQLite.openDatabaseAsync('cofi_loan_app.db');
    try {
      const table = await legacy.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='offline_auth_credentials'"
      );
      if (!table) return;
      const rows = await legacy.getAllAsync<Record<string, unknown>>(
        'SELECT * FROM offline_auth_credentials'
      );
      for (const row of rows) {
        await shared.runAsync(
          `INSERT OR IGNORE INTO offline_auth_credentials (
            email_normalized, role, verifier, verifier_version, user_snapshot,
            last_online_auth_at, last_offline_auth_at, pending_server_validation,
            stored_token, stored_refresh_token, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          String(row.email_normalized ?? ''),
          String(row.role ?? 'client'),
          String(row.verifier ?? ''),
          Number(row.verifier_version ?? 1),
          String(row.user_snapshot ?? '{}'),
          String(row.last_online_auth_at ?? new Date().toISOString()),
          row.last_offline_auth_at != null ? String(row.last_offline_auth_at) : null,
          Number(row.pending_server_validation ?? 0),
          row.stored_token != null ? String(row.stored_token) : null,
          row.stored_refresh_token != null ? String(row.stored_refresh_token) : null,
          String(row.updated_at ?? new Date().toISOString())
        );
      }
    } finally {
      try {
        await legacy.closeAsync();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* legacy DB may not exist */
  }
}

/** Open account DB + migrations (requires active account scope). */
export async function warmAppDatabase(): Promise<void> {
  await getAppDatabase();
}

/** Warm shared offline-auth DB (safe before login). */
export async function warmSharedAuthDatabase(): Promise<void> {
  await getSharedAuthDatabase();
}

/* ---------------------------------------------------------------------------
 * Portal registration queue (shared DB)
 *
 * Self-registration happens before anyone is signed in, so there is no
 * account-scoped database yet. These rows live in the shared auth DB so a
 * borrower can complete sign-up with no signal and have it upload later.
 * ------------------------------------------------------------------------- */

export type PortalQueueRow = {
  id: number;
  operation: string;
  entity_local_id: string;
  payload: string;
  created_at: string;
  retry_count: number;
  last_error: string | null;
  sync_status: string | null;
};

export async function sqliteEnqueuePortalRegistration(
  operation: string,
  entityLocalId: string,
  payload: object
): Promise<void> {
  const database = await getSharedAuthDatabase();
  const now = nowIso();
  const existing = await database.getFirstAsync<{ id: number }>(
    `SELECT id FROM portal_sync_queue
     WHERE operation = ? AND entity_local_id = ?
       AND (sync_status IN ('pending', 'failed', 'conflict') OR sync_status IS NULL)
     ORDER BY id ASC LIMIT 1`,
    operation,
    entityLocalId
  );
  if (existing) {
    await database.runAsync(
      `UPDATE portal_sync_queue
       SET payload = ?, sync_status = 'pending', last_error = NULL, created_at = ?
       WHERE id = ?`,
      JSON.stringify(payload),
      now,
      existing.id
    );
    return;
  }
  await database.runAsync(
    `INSERT INTO portal_sync_queue (operation, entity_local_id, payload, created_at, sync_status, retry_count)
     VALUES (?, ?, ?, ?, 'pending', 0)`,
    operation,
    entityLocalId,
    JSON.stringify(payload),
    now
  );
}

export async function sqliteGetPortalQueueRows(
  statuses: string[] = ['pending']
): Promise<PortalQueueRow[]> {
  try {
    const database = await getSharedAuthDatabase();
    const includesPending = statuses.includes('pending');
    const list = statuses.map((s) => `'${s}'`).join(', ');
    return await database.getAllAsync<PortalQueueRow>(
      `SELECT * FROM portal_sync_queue
       WHERE sync_status IN (${list})${includesPending ? ' OR sync_status IS NULL' : ''}
       ORDER BY id ASC`
    );
  } catch {
    return [];
  }
}

export async function sqliteCountPendingPortalRegistrations(): Promise<number> {
  try {
    const database = await getSharedAuthDatabase();
    const row = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM portal_sync_queue WHERE sync_status = 'pending' OR sync_status IS NULL"
    );
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function sqliteDeletePortalQueueRow(id: number): Promise<void> {
  try {
    const database = await getSharedAuthDatabase();
    await database.runAsync('DELETE FROM portal_sync_queue WHERE id = ?', id);
  } catch {
    /* ignore */
  }
}

export async function sqliteMarkPortalQueueRowFailed(
  id: number,
  error: string,
  status: 'failed' | 'conflict'
): Promise<void> {
  try {
    const database = await getSharedAuthDatabase();
    await database.runAsync(
      'UPDATE portal_sync_queue SET retry_count = retry_count + 1, last_error = ?, sync_status = ? WHERE id = ?',
      error,
      status,
      id
    );
  } catch {
    /* ignore */
  }
}

export async function sqliteRequeueFailedPortalRegistrations(): Promise<void> {
  try {
    const database = await getSharedAuthDatabase();
    await database.runAsync(
      "UPDATE portal_sync_queue SET sync_status = 'pending' WHERE sync_status = 'failed' AND retry_count < 20"
    );
  } catch {
    /* ignore */
  }
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  return getAppDatabase();
}

async function initSchema(database: SQLite.SQLiteDatabase) {
  const now = new Date().toISOString();
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone_number TEXT,
      national_id TEXT,
      email TEXT,
      address TEXT,
      occupation TEXT,
      monthly_income INTEGER,
      customer_number TEXT,
      photo_uri TEXT,
      id_document_uri TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      requested_amount INTEGER NOT NULL,
      approved_amount INTEGER,
      requested_term_months INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      application_date TEXT NOT NULL,
      client_id TEXT,
      client_name TEXT,
      purpose TEXT,
      documents_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE INDEX IF NOT EXISTS idx_applications_client ON applications(client_id);
    CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
  `);

  // KYC document fields used by staff review across LO / CIO / compliance.
  for (const col of ['id_document_back_uri', 'group_constitution_uri'] as const) {
    try {
      await database.execAsync(`ALTER TABLE clients ADD COLUMN ${col} TEXT`);
    } catch {
      /* column already exists */
    }
  }

  // Demo rows are only for local/demo builds (EXPO_PUBLIC_USE_API=false).
  // Production API mode must start empty so offline ghosts never appear.
  if (!USE_API) {
    const clientCount =
      (await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM clients'))
        ?.count ?? 0;
    if (clientCount === 0) {
      const seedClients = [
        ['1', 'John Mwale', '+265991234567', 'MW/MWN/123456', 'C001'],
        ['2', 'Mary Banda', '+265992345678', 'MW/MWN/234567', 'C002'],
        ['3', 'Peter Phiri', '+265993456789', 'MW/MWN/345678', 'C003'],
        ['4', 'Grace Tembo', '+265994567890', 'MW/MWN/456789', 'C004'],
        ['5', 'James Nkhoma', '+265995678901', 'MW/MWN/567890', 'C005'],
      ];
      for (const [id, name, phone, nationalId, custNum] of seedClients) {
        await database.runAsync(
          'INSERT OR IGNORE INTO clients (id, name, phone_number, national_id, customer_number, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          id,
          name,
          phone,
          nationalId,
          custNum,
          now
        );
      }
    }

    const appCount =
      (await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM applications'))
        ?.count ?? 0;
    if (appCount === 0) {
      const seedApps = [
        ['APP-2024-001', 'APPROVED', 500000, 500000, 12, 'Personal Loan', '2024-01-15', '1', 'John Mwale'],
        ['APP-2024-002', 'PENDING', 1000000, null, 24, 'Business Loan', '2024-02-01', '2', 'Mary Banda'],
        ['APP-2024-003', 'SUBMITTED', 250000, null, 6, 'Agric Loan', '2024-02-10', null, null],
      ];
      for (const [appNum, status, reqAmt, apprAmt, term, product, appDate, clientId, clientName] of seedApps) {
        await database.runAsync(
          `INSERT INTO applications (
            application_number, status, requested_amount, approved_amount,
            requested_term_months, product_name, application_date, client_id,
            client_name, purpose, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          appNum,
          status,
          reqAmt,
          apprAmt ?? null,
          term,
          product,
          appDate,
          clientId ?? null,
          clientName ?? null,
          null,
          now
        );
      }
    }
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── Applications ─────────────────────────────────────────────────────────

export async function sqliteGetApplications(clientId?: string, clientName?: string): Promise<LoanApplicationRow[]> {
  const database = await getDb();
  if (clientId) {
    return database.getAllAsync<LoanApplicationRow>(
      'SELECT * FROM applications WHERE client_id = ? ORDER BY created_at DESC',
      [clientId]
    );
  }
  if (clientName) {
    return database.getAllAsync<LoanApplicationRow>(
      'SELECT * FROM applications WHERE client_name = ? ORDER BY created_at DESC',
      [clientName]
    );
  }
  return database.getAllAsync<LoanApplicationRow>(
    'SELECT * FROM applications ORDER BY created_at DESC'
  );
}

export async function sqliteCreateApplication(
  row: Omit<LoanApplicationRow, 'id' | 'created_at'> & {
    sync_status?: LoanApplicationRow['sync_status'];
    remote_id?: number | null;
  }
): Promise<LoanApplicationRow> {
  const database = await getDb();
  const created_at = nowIso();
  const sync_status = row.sync_status ?? 'pending';
  const remote_id = row.remote_id ?? null;
  const result = await database.runAsync(
    `INSERT INTO applications (
      application_number, status, requested_amount, approved_amount,
      requested_term_months, product_name, application_date, client_id,
      client_name, purpose, documents_json, created_at, sync_status, remote_id,
      loan_product_id, loan_type, application_notes, selected_repayment_strategy,
      origination_return_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.application_number,
      row.status,
      row.requested_amount,
      row.approved_amount ?? null,
      row.requested_term_months,
      row.product_name,
      row.application_date,
      row.client_id ?? null,
      row.client_name ?? null,
      row.purpose ?? null,
      row.documents_json ?? null,
      created_at,
      sync_status,
      remote_id,
      row.loan_product_id ?? null,
      row.loan_type ?? null,
      row.application_notes ?? null,
      row.selected_repayment_strategy ?? null,
      row.origination_return_reason ?? null,
    ]
  );
  const id = result.lastInsertRowId;
  return {
    id: Number(id),
    ...row,
    created_at,
    sync_status,
    remote_id,
  };
}

/**
 * Cache a server-confirmed application locally (online-first path).
 * Uses the remote id as the local primary key when inserting fresh.
 */
export async function sqliteCacheSyncedApplication(
  row: LoanApplicationRow
): Promise<LoanApplicationRow> {
  const database = await getDb();
  const remoteId = row.remote_id ?? row.id;
  const created_at = row.created_at || nowIso();
  const existing = await database.getFirstAsync<{ id: number }>(
    'SELECT id FROM applications WHERE remote_id = ? OR id = ?',
    [remoteId, remoteId]
  );

  if (existing) {
    await database.runAsync(
      `UPDATE applications SET
        application_number = ?, status = ?, requested_amount = ?, approved_amount = ?,
        requested_term_months = ?, product_name = ?, application_date = ?, client_id = ?,
        client_name = ?, purpose = ?, documents_json = ?, sync_status = 'synced', remote_id = ?,
        loan_product_id = ?, loan_type = ?, application_notes = ?, selected_repayment_strategy = ?,
        origination_return_reason = ?
       WHERE id = ?`,
      [
        row.application_number,
        row.status,
        row.requested_amount,
        row.approved_amount ?? null,
        row.requested_term_months,
        row.product_name,
        row.application_date,
        row.client_id ?? null,
        row.client_name ?? null,
        row.purpose ?? null,
        row.documents_json ?? null,
        remoteId,
        row.loan_product_id ?? null,
        row.loan_type ?? null,
        row.application_notes ?? null,
        row.selected_repayment_strategy ?? null,
        row.origination_return_reason ?? null,
        existing.id,
      ]
    );
    return {
      ...row,
      id: existing.id,
      created_at,
      sync_status: 'synced',
      remote_id: remoteId,
    };
  }

  await database.runAsync(
    `INSERT INTO applications (
      id, application_number, status, requested_amount, approved_amount,
      requested_term_months, product_name, application_date, client_id,
      client_name, purpose, documents_json, created_at, sync_status, remote_id,
      loan_product_id, loan_type, application_notes, selected_repayment_strategy,
      origination_return_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?, ?, ?, ?)`,
    [
      remoteId,
      row.application_number,
      row.status,
      row.requested_amount,
      row.approved_amount ?? null,
      row.requested_term_months,
      row.product_name,
      row.application_date,
      row.client_id ?? null,
      row.client_name ?? null,
      row.purpose ?? null,
      row.documents_json ?? null,
      created_at,
      remoteId,
      row.loan_product_id ?? null,
      row.loan_type ?? null,
      row.application_notes ?? null,
      row.selected_repayment_strategy ?? null,
      row.origination_return_reason ?? null,
    ]
  );

  return {
    ...row,
    id: remoteId,
    created_at,
    sync_status: 'synced',
    remote_id: remoteId,
  };
}

export async function sqliteUpdateApplication(
  id: number,
  updates: {
    status?: string;
    approved_amount?: number;
    approved_term_months?: number;
    requested_amount?: number;
    requested_term_months?: number;
    purpose?: string | null;
    sync_status?: string;
    remote_id?: number | null;
    product_name?: string | null;
    loan_product_id?: number | null;
    loan_type?: string | null;
    application_notes?: string | null;
    selected_repayment_strategy?: string | null;
  }
): Promise<void> {
  const database = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.approved_amount !== undefined) {
    fields.push('approved_amount = ?');
    values.push(updates.approved_amount);
  }
  if (updates.approved_term_months !== undefined) {
    fields.push('approved_term_months = ?');
    values.push(updates.approved_term_months);
  }
  if (updates.requested_amount !== undefined) {
    fields.push('requested_amount = ?');
    values.push(updates.requested_amount);
  }
  if (updates.requested_term_months !== undefined) {
    fields.push('requested_term_months = ?');
    values.push(updates.requested_term_months);
  }
  if (updates.purpose !== undefined) {
    fields.push('purpose = ?');
    values.push(updates.purpose);
  }
  if (updates.sync_status !== undefined) {
    fields.push('sync_status = ?');
    values.push(updates.sync_status);
  }
  if (updates.remote_id !== undefined) {
    fields.push('remote_id = ?');
    values.push(updates.remote_id);
  }
  if (updates.loan_product_id !== undefined) {
    fields.push('loan_product_id = ?');
    values.push(updates.loan_product_id);
  }
  if (updates.product_name !== undefined) {
    fields.push('product_name = ?');
    values.push(updates.product_name);
  }
  if (updates.loan_type !== undefined) {
    fields.push('loan_type = ?');
    values.push(updates.loan_type);
  }
  if (updates.application_notes !== undefined) {
    fields.push('application_notes = ?');
    values.push(updates.application_notes);
  }
  if (updates.selected_repayment_strategy !== undefined) {
    fields.push('selected_repayment_strategy = ?');
    values.push(updates.selected_repayment_strategy);
  }
  if (fields.length === 0) return;
  values.push(id);
  await database.runAsync(
    `UPDATE applications SET ${fields.join(', ')} WHERE id = ?`,
    values as any
  );
}

export async function sqliteDeleteApplication(id: number): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM applications WHERE id = ?', id);
  try {
    await database.runAsync(
      `DELETE FROM sync_queue
       WHERE entity_type = 'application' AND entity_local_id = ?`,
      String(id)
    );
  } catch {
    /* ignore */
  }
}

export async function sqliteGetApplication(id: number): Promise<LoanApplicationRow | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<LoanApplicationRow>(
    'SELECT * FROM applications WHERE id = ?',
    [id]
  );
  return row ?? null;
}

/** Resolve a local row by primary key or linked remote_id. */
export async function sqliteGetApplicationByAnyId(
  id: number
): Promise<LoanApplicationRow | null> {
  const byId = await sqliteGetApplication(id);
  if (byId) return byId;
  const database = await getDb();
  const row = await database.getFirstAsync<LoanApplicationRow>(
    'SELECT * FROM applications WHERE remote_id = ?',
    [id]
  );
  return row ?? null;
}

// ─── Clients ───────────────────────────────────────────────────────────────

export async function sqliteGetClients(): Promise<ClientRow[]> {
  const database = await getDb();
  const result = await database.getAllAsync<ClientRow>(
    'SELECT * FROM clients ORDER BY name ASC'
  );
  return result;
}

export async function sqliteGetPendingClients(): Promise<ClientRow[]> {
  const database = await getDb();
  try {
    return database.getAllAsync<ClientRow>(
      "SELECT * FROM clients WHERE sync_status = 'pending' ORDER BY created_at DESC"
    );
  } catch {
    return [];
  }
}

export async function sqliteUpdateClientSync(
  localId: string,
  updates: { remote_id?: number | null; sync_status?: string }
): Promise<void> {
  const database = await getDb();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [nowIso()];
  if (updates.remote_id !== undefined) {
    fields.push('remote_id = ?');
    values.push(updates.remote_id);
  }
  if (updates.sync_status !== undefined) {
    fields.push('sync_status = ?');
    values.push(updates.sync_status);
  }
  values.push(localId);
  await database.runAsync(
    `UPDATE clients SET ${fields.join(', ')} WHERE id = ?`,
    values as (string | number | null)[]
  );
}

export async function sqliteGetClient(id: string): Promise<ClientRow | null> {
  const database = await getDb();
  const result = await database.getFirstAsync<ClientRow>(
    'SELECT * FROM clients WHERE id = ?',
    [id]
  );
  return result ?? null;
}

export async function sqliteUpsertClients(rows: ClientRow[]): Promise<void> {
  if (!rows || rows.length === 0) return;
  const database = await getDb();
  const now = nowIso();
  await database.execAsync('BEGIN TRANSACTION');
  try {
    for (const row of rows) {
      await database.runAsync(
        `INSERT OR REPLACE INTO clients (
          id, name, phone_number, national_id, email, address, occupation,
          monthly_income, customer_number, photo_uri, id_document_uri,
          id_document_back_uri, group_constitution_uri, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, ?), ?)`,
        [
          row.id,
          row.name,
          row.phone_number ?? null,
          row.national_id ?? null,
          row.email ?? null,
          row.address ?? null,
          row.occupation ?? null,
          row.monthly_income ?? null,
          row.customer_number ?? null,
          row.photo_uri ?? null,
          row.id_document_uri ?? null,
          row.id_document_back_uri ?? null,
          row.group_constitution_uri ?? null,
          row.created_at ?? now,
          row.created_at ?? now,
          now,
        ]
      );
    }
    await database.execAsync('COMMIT');
  } catch (e) {
    await database.execAsync('ROLLBACK');
    throw e;
  }
}

/**
 * Cache a group's member roster so group loan origination keeps working in the
 * field. Members are stored as ordinary client rows tagged with the parent id.
 */
export async function sqliteCacheGroupMembers(
  parentClientId: number,
  rows: ClientRow[]
): Promise<void> {
  if (!rows || rows.length === 0) return;
  const database = await getDb();
  const now = nowIso();
  for (const row of rows) {
    try {
      await database.runAsync(
        `INSERT OR REPLACE INTO clients (
          id, name, phone_number, national_id, email, address, occupation,
          monthly_income, customer_number, photo_uri, id_document_uri,
          created_at, updated_at, sync_status, remote_id, client_type, parent_client_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, ?), ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.name,
          row.phone_number ?? null,
          row.national_id ?? null,
          row.email ?? null,
          row.address ?? null,
          row.occupation ?? null,
          row.monthly_income ?? null,
          row.customer_number ?? null,
          row.photo_uri ?? null,
          row.id_document_uri ?? null,
          row.created_at ?? now,
          row.created_at ?? now,
          now,
          'synced',
          row.remote_id ?? (Number.parseInt(String(row.id), 10) || null),
          row.client_type ?? null,
          parentClientId,
        ]
      );
    } catch {
      /* one bad row must not drop the whole roster cache */
    }
  }
}

export async function sqliteGetGroupMembers(parentClientId: number): Promise<ClientRow[]> {
  const database = await getDb();
  try {
    return await database.getAllAsync<ClientRow>(
      'SELECT * FROM clients WHERE parent_client_id = ? ORDER BY name ASC',
      [parentClientId]
    );
  } catch {
    return [];
  }
}

export async function sqliteCreateClient(
  row: Omit<ClientRow, 'created_at' | 'updated_at'>
): Promise<ClientRow> {
  const database = await getDb();
  const created_at = nowIso();
  const sync_status = row.sync_status ?? 'synced';
  await database.runAsync(
    `INSERT INTO clients (
      id, name, phone_number, national_id, email, address, occupation,
      monthly_income, customer_number, photo_uri, id_document_uri, created_at,
      sync_status, remote_id, client_type, parent_client_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.name,
      row.phone_number ?? null,
      row.national_id ?? null,
      row.email ?? null,
      row.address ?? null,
      row.occupation ?? null,
      row.monthly_income ?? null,
      row.customer_number ?? null,
      row.photo_uri ?? null,
      row.id_document_uri ?? null,
      created_at,
      sync_status,
      row.remote_id ?? null,
      row.client_type ?? null,
      row.parent_client_id ?? null,
    ]
  );
  return { ...row, created_at, sync_status };
}

export async function sqliteUpdateClient(
  id: string,
  updates: Partial<Pick<ClientRow, 'name' | 'phone_number' | 'national_id' | 'email' | 'address' | 'occupation' | 'monthly_income' | 'photo_uri' | 'id_document_uri'>>
): Promise<void> {
  const database = await getDb();
  const updated_at = nowIso();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [updated_at];

  const allowed = ['name', 'phone_number', 'national_id', 'email', 'address', 'occupation', 'monthly_income', 'photo_uri', 'id_document_uri'] as const;
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }
  values.push(id);
  await database.runAsync(
    `UPDATE clients SET ${fields.join(', ')} WHERE id = ?`,
    values as any
  );
}

// ─── Pending repayments (offline recording) ─────────────────────────────────

export interface PendingRepaymentRow {
  id: number;
  loan_id: number;
  client_id: number;
  loan_account_number: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  repayment_date: string;
  sync_status: string;
  created_at: string;
  client_reference?: string;
}

/**
 * F7: dependency-free idempotency key for offline repayment capture. Uniqueness
 * per device queue is sufficient (timestamp + random suffix); the key is sent to
 * the backend so a re-synced repayment is deduplicated rather than double-posted.
 * Avoids adding a native crypto/uuid module (no EAS rebuild required).
 */
export function makeClientReference(): string {
  const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return `mob-${Date.now().toString(36)}-${rand}`;
}

export async function sqliteInsertPendingRepayment(
  row: Omit<PendingRepaymentRow, 'id' | 'sync_status' | 'created_at'>
): Promise<PendingRepaymentRow> {
  const database = await getDb();
  const created_at = nowIso();
  const client_reference = row.client_reference ?? makeClientReference();
  const result = await database.runAsync(
    `INSERT INTO pending_repayments (loan_id, client_id, loan_account_number, amount, principal_amount, interest_amount, repayment_date, created_at, client_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.loan_id, row.client_id, row.loan_account_number, row.amount, row.principal_amount, row.interest_amount, row.repayment_date, created_at, client_reference
  );
  return {
    id: Number(result.lastInsertRowId),
    ...row,
    client_reference,
    sync_status: 'pending',
    created_at,
  };
}

export async function sqliteGetPendingRepayments(): Promise<PendingRepaymentRow[]> {
  const database = await getDb();
  try {
    return database.getAllAsync<PendingRepaymentRow>(
      'SELECT * FROM pending_repayments ORDER BY created_at DESC'
    );
  } catch {
    return [];
  }
}

// ─── Loans cache (for offline display) ──────────────────────────────────────

export interface CachedLoanRow {
  id: number;
  loan_account_number: string;
  client_id?: number;
  client_name?: string;
  product_name?: string;
  principal_amount: number;
  outstanding_principal: number;
  total_repaid?: number;
  status: string;
  next_due_date?: string;
  days_in_arrears?: number;
  days_until_next_repayment?: number | null;
  repayment_tracking_live?: number | null;
  cached_at: string;
}

export async function sqliteUpsertLoansCache(loans: CachedLoanRow[]): Promise<void> {
  const database = await getDb();
  const now = nowIso();
  for (const loan of loans) {
    await database.runAsync(
      `INSERT OR REPLACE INTO loans_cache (id, loan_account_number, client_id, client_name, product_name, principal_amount, outstanding_principal, total_repaid, status, next_due_date, days_in_arrears, days_until_next_repayment, repayment_tracking_live, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      loan.id, loan.loan_account_number, loan.client_id ?? null, loan.client_name ?? null, loan.product_name ?? null,
      loan.principal_amount, loan.outstanding_principal, loan.total_repaid ?? null, loan.status,
      loan.next_due_date ?? null, loan.days_in_arrears ?? null,
      loan.days_until_next_repayment ?? null,
      loan.repayment_tracking_live == null ? null : (loan.repayment_tracking_live ? 1 : 0),
      now
    );
  }
}

export async function sqliteGetCachedLoans(): Promise<CachedLoanRow[]> {
  const database = await getDb();
  try {
    return database.getAllAsync<CachedLoanRow>('SELECT * FROM loans_cache ORDER BY id');
  } catch {
    return [];
  }
}

export async function sqliteGetLoansCacheSyncedAt(): Promise<string | null> {
  const database = await getDb();
  try {
    const row = await database.getFirstAsync<{ cached_at: string }>(
      'SELECT MAX(cached_at) AS cached_at FROM loans_cache'
    );
    return row?.cached_at ?? null;
  } catch {
    return null;
  }
}

// ─── Schedule cache (read-through offline — E6.7) ───────────────────────────

export async function sqliteUpsertScheduleCache(loanId: number, items: unknown[]): Promise<void> {
  const database = await getDb();
  const now = nowIso();
  await database.runAsync(
    'INSERT OR REPLACE INTO schedules_cache (loan_id, payload, cached_at) VALUES (?, ?, ?)',
    loanId,
    JSON.stringify(items),
    now
  );
}

export async function sqliteGetScheduleCache(loanId: number): Promise<{ items: unknown[]; cached_at: string } | null> {
  const database = await getDb();
  try {
    const row = await database.getFirstAsync<{ payload: string; cached_at: string }>(
      'SELECT payload, cached_at FROM schedules_cache WHERE loan_id = ?',
      loanId
    );
    if (!row?.payload) return null;
    const parsed = JSON.parse(row.payload);
    return { items: Array.isArray(parsed) ? parsed : [], cached_at: row.cached_at };
  } catch {
    return null;
  }
}

// ─── Loan products catalog (prefetch at startup, read in origination modal) ───

export type LoanProductAudience = 'client' | 'staff';

export async function sqliteUpsertLoanProductsCatalog(
  audience: LoanProductAudience,
  products: unknown[]
): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();
  await database.runAsync(
    'INSERT OR REPLACE INTO loan_products_catalog (audience, payload, cached_at) VALUES (?, ?, ?)',
    audience,
    JSON.stringify(products),
    now
  );
}

export async function sqliteGetLoanProductsCatalog(
  audience: LoanProductAudience
): Promise<{ products: unknown[]; cached_at: string } | null> {
  const database = await getDb();
  try {
    const row = await database.getFirstAsync<{ payload: string; cached_at: string }>(
      'SELECT payload, cached_at FROM loan_products_catalog WHERE audience = ?',
      audience
    );
    if (!row?.payload) return null;
    const parsed = JSON.parse(row.payload);
    return {
      products: Array.isArray(parsed) ? parsed : [],
      cached_at: row.cached_at,
    };
  } catch {
    return null;
  }
}

export async function sqliteClearLoanProductsCatalog(): Promise<void> {
  const database = await getDb();
  try {
    await database.runAsync('DELETE FROM loan_products_catalog');
  } catch {
    /* ignore */
  }
}
