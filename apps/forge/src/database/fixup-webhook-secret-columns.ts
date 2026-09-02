import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

import { migrationsDebug } from './migrations-debug';

const TARGET_TABLE = 'webhook_routes';
const TARGET_COLUMNS = ['secret_encrypted', 'secret_last_four'] as const;

export const WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP = 1782120723420;

type FixupAction =
  | 'not_started'
  | 'table_missing'
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
    return { action: 'table_missing', addedColumns: [], insertedJournalEntry: false };
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
