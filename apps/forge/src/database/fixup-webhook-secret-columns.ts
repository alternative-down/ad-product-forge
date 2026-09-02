import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

import { migrationsDebug } from './migrations-debug';

const TARGET_TABLE = 'webhook_routes';
const TARGET_COLUMNS = ['secret_encrypted', 'secret_last_four'] as const;

const WEBHOOK_TABLES_MIGRATION_TIMESTAMP = 1780485628386;
export const WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP = 1782120723420;

type FixupAction =
  | 'not_started'
  | 'table_missing'
  | 'tables_recovered'
  | 'already_applied'
  | 'columns_completed'
  | 'journal_synchronized';

export interface WebhookSecretColumnsFixupResult {
  action: FixupAction;
  addedColumns: string[];
  insertedJournalEntry: boolean;
}

export async function fixupWebhookSecretColumns(
  db: LibSQLDatabase<Record<string, unknown>>,
  migrationHash: string,
): Promise<WebhookSecretColumnsFixupResult> {
  const tables = await db.all<{ name: string }>(sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${TARGET_TABLE}
  `);
  if (tables.length === 0) {
    const appliedRows = await db.all<{ createdAt: number; targetApplied: number }>(sql`
      SELECT
        MAX(created_at) as createdAt,
        MAX(CASE WHEN created_at = ${WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP} THEN 1 ELSE 0 END)
          as targetApplied
      FROM __drizzle_migrations
    `);
    const latestAppliedAt = Number(appliedRows[0]?.createdAt ?? 0);
    if (latestAppliedAt < WEBHOOK_TABLES_MIGRATION_TIMESTAMP) {
      return { action: 'table_missing', addedColumns: [], insertedJournalEntry: false };
    }

    await recoverSkippedWebhookTables(db);
    const insertedJournalEntry = Number(appliedRows[0]?.targetApplied ?? 0) === 0;
    if (insertedJournalEntry) {
      await db.run(sql`
        INSERT INTO __drizzle_migrations (hash, created_at)
        VALUES (${migrationHash}, ${WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP})
      `);
    }
    migrationsDebug('warn', 'Recovered webhook tables skipped by retroactive migrations', {
      latestAppliedAt,
    });
    return {
      action: 'tables_recovered',
      addedColumns: [...TARGET_COLUMNS],
      insertedJournalEntry,
    };
  }

  const columns = await db.all<{ name: string }>(sql`PRAGMA table_info(${sql.raw(TARGET_TABLE)})`);
  const columnNames = new Set(columns.map((column) => column.name));
  const existingTargetColumns = TARGET_COLUMNS.filter((column) => columnNames.has(column));
  const journalRows = await db.all<{ hash: string }>(sql`
    SELECT hash
    FROM __drizzle_migrations
    WHERE created_at = ${WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP}
  `);
  const journalEntryExists = journalRows.length > 0;

  if (existingTargetColumns.length === 0 && !journalEntryExists) {
    return { action: 'not_started', addedColumns: [], insertedJournalEntry: false };
  }

  const missingColumns = TARGET_COLUMNS.filter((column) => !columnNames.has(column));
  const addedColumns: string[] = [];
  for (const column of missingColumns) {
    await db.run(
      sql`ALTER TABLE ${sql.raw(TARGET_TABLE)} ADD COLUMN ${sql.raw(column)} text`,
    );
    addedColumns.push(column);
  }

  let insertedJournalEntry = false;
  if (!journalEntryExists) {
    await db.run(sql`
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES (${migrationHash}, ${WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP})
    `);
    insertedJournalEntry = true;
  }

  const action: FixupAction = addedColumns.length > 0
    ? 'columns_completed'
    : insertedJournalEntry
      ? 'journal_synchronized'
      : 'already_applied';

  migrationsDebug('info', 'Webhook secret columns migration state reconciled', {
    action,
    addedColumns,
    insertedJournalEntry,
  });

  return { action, addedColumns, insertedJournalEntry };
}

async function recoverSkippedWebhookTables(
  db: LibSQLDatabase<Record<string, unknown>>,
): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE webhook_routes (
      route_id text PRIMARY KEY NOT NULL,
      agent_id text NOT NULL,
      name text NOT NULL,
      secret text,
      secret_encrypted text,
      secret_last_four text,
      is_active integer DEFAULT 1 NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE cascade
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      event_id text PRIMARY KEY NOT NULL,
      route_id text NOT NULL,
      agent_id text NOT NULL,
      payload text NOT NULL,
      headers text NOT NULL,
      idempotency_key text,
      status text DEFAULT 'pending' NOT NULL,
      received_at integer NOT NULL,
      processed_at integer,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      FOREIGN KEY (route_id) REFERENCES webhook_routes(route_id) ON DELETE cascade,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE cascade
    )
  `));
  await db.run(sql.raw(
    'CREATE INDEX IF NOT EXISTS webhook_routes_agent_id_idx ON webhook_routes(agent_id)',
  ));
  await db.run(sql.raw(
    'CREATE INDEX IF NOT EXISTS webhook_events_route_id_idx ON webhook_events(route_id)',
  ));
  await db.run(sql.raw(
    'CREATE INDEX IF NOT EXISTS webhook_events_agent_id_idx ON webhook_events(agent_id)',
  ));
  await db.run(sql.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_idempotency_unique_idx
    ON webhook_events(route_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  `));
}
