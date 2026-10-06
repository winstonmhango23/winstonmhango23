/**
 * SQLite schema for offline-first sync.
 * Run migrations on app init.
 */

import * as SQLite from 'expo-sqlite';

const SCHEMA_VERSION_LATEST = 10;

type SchemaVersionColumn = { name: string };

/** Singleton row (id=1) — legacy table used version as PK and could accumulate duplicate rows. */
async function ensureSchemaVersionTable(database: SQLite.SQLiteDatabase): Promise<number> {
  const tableExists = await database.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'"
  );

  if (!tableExists) {
    await database.execAsync(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO schema_version (id, version) VALUES (1, 0);
    `);
    return 0;
  }

  const columns = await database.getAllAsync<SchemaVersionColumn>(
    'PRAGMA table_info(schema_version)'
  );
  const hasSingletonId = columns.some((column) => column.name === 'id');

  if (!hasSingletonId) {
    const rows = await database.getAllAsync<{ version: number }>('SELECT version FROM schema_version');
    const maxVersion = rows.reduce((max, row) => Math.max(max, row.version ?? 0), 0);
    await database.execAsync('DROP TABLE schema_version');
    await database.execAsync(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0
      );
    `);
    await database.runAsync('INSERT INTO schema_version (id, version) VALUES (1, ?)', maxVersion);
    return maxVersion;
  }

  const rowCount = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM schema_version'
  );
  if ((rowCount?.count ?? 0) > 1) {
    const maxRow = await database.getFirstAsync<{ version: number }>(
      'SELECT MAX(version) as version FROM schema_version WHERE id = 1'
    );
    const maxVersion = maxRow?.version ?? SCHEMA_VERSION_LATEST;
    await database.execAsync('DELETE FROM schema_version');
    await database.runAsync('INSERT INTO schema_version (id, version) VALUES (1, ?)', maxVersion);
    return maxVersion;
  }

  await database.runAsync('INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0)');
  const row = await database.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version WHERE id = 1'
  );
  return row?.version ?? 0;
}

async function setSchemaVersion(database: SQLite.SQLiteDatabase, version: number): Promise<void> {
  await database.runAsync('UPDATE schema_version SET version = ? WHERE id = 1', version);
}

export async function runSyncMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  let version = await ensureSchemaVersionTable(database);

  if (version < 1) {
    try {
      await database.execAsync('ALTER TABLE applications ADD COLUMN sync_status TEXT DEFAULT "synced"');
    } catch { /* column may exist */ }
    try {
      await database.execAsync('ALTER TABLE applications ADD COLUMN remote_id INTEGER');
    } catch { /* column may exist */ }
    await setSchemaVersion(database, 1);
    version = 1;
  }

  if (version < 2) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_local_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        sync_status TEXT DEFAULT 'pending'
      );
      CREATE INDEX IF NOT EXISTS idx_sync_queue_operation ON sync_queue(operation);

      CREATE TABLE IF NOT EXISTS pending_repayments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL,
        loan_account_number TEXT NOT NULL,
        amount INTEGER NOT NULL,
        principal_amount INTEGER NOT NULL,
        interest_amount INTEGER NOT NULL,
        repayment_date TEXT NOT NULL,
        sync_status TEXT DEFAULT 'pending',
        remote_id INTEGER,
        client_reference TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS loans_cache (
        id INTEGER PRIMARY KEY,
        loan_account_number TEXT NOT NULL,
        client_id INTEGER,
        client_name TEXT,
        product_name TEXT,
        principal_amount INTEGER,
        outstanding_principal INTEGER,
        total_repaid INTEGER,
        status TEXT,
        next_due_date TEXT,
        days_in_arrears INTEGER,
        cached_at TEXT NOT NULL
      );
    `);
    await setSchemaVersion(database, 2);
    version = 2;
  }

  if (version < 3) {
    try {
      await database.execAsync('ALTER TABLE sync_queue ADD COLUMN sync_status TEXT DEFAULT "pending"');
    } catch { /* column may exist */ }
    await setSchemaVersion(database, 3);
    version = 3;
  }

  if (version < 4) {
    try {
      await database.execAsync(
        'ALTER TABLE loans_cache ADD COLUMN days_until_next_repayment INTEGER'
      );
    } catch {
      /* column may exist */
    }
    try {
      await database.execAsync(
        'ALTER TABLE loans_cache ADD COLUMN repayment_tracking_live INTEGER'
      );
    } catch {
      /* column may exist */
    }
    await setSchemaVersion(database, 4);
    version = 4;
  }

  if (version < 5) {
    try {
      await database.execAsync('ALTER TABLE pending_repayments ADD COLUMN client_reference TEXT');
    } catch {
      /* column may exist */
    }
    await setSchemaVersion(database, 5);
    version = 5;
  }

  if (version < 6) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS schedules_cache (
        loan_id INTEGER PRIMARY KEY,
        payload TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );
    `);
    await setSchemaVersion(database, 6);
    version = 6;
  }

  if (version < 7) {
    try {
      await database.execAsync('ALTER TABLE clients ADD COLUMN sync_status TEXT DEFAULT "synced"');
    } catch { /* column may exist */ }
    try {
      await database.execAsync('ALTER TABLE clients ADD COLUMN remote_id INTEGER');
    } catch { /* column may exist */ }
    try {
      await database.execAsync('ALTER TABLE clients ADD COLUMN client_type TEXT');
    } catch { /* column may exist */ }
    try {
      await database.execAsync('ALTER TABLE clients ADD COLUMN parent_client_id TEXT');
    } catch { /* column may exist */ }
    await setSchemaVersion(database, 7);
    version = 7;
  }

  if (version < 8) {
    await database.execAsync(`
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
    await setSchemaVersion(database, 8);
  }

  if (version < 9) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS loan_products_catalog (
        audience TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        cached_at TEXT NOT NULL
      );
    `);
    await setSchemaVersion(database, 9);
  }

  if (version < 10) {
    // Loan officer rework editor — product-aware fields on the applications row.
    for (const col of [
      'loan_product_id INTEGER',
      'loan_type TEXT',
      'application_notes TEXT',
      'selected_repayment_strategy TEXT',
      'origination_return_reason TEXT',
    ]) {
      try {
        await database.execAsync(`ALTER TABLE applications ADD COLUMN ${col}`);
      } catch {
        /* column may exist */
      }
    }
    await setSchemaVersion(database, 10);
  }
}
