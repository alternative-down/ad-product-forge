import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

import { migrationsDebug } from './migrations-debug';

export const UPDATED_AT_COLUMNS_MIGRATION_TIMESTAMP = 1780522073127;

const TARGET_TABLES = [
  'agent_providers',
  'agent_execution_contracts',
  'agent_execution_steps',
  'agent_notifications',
  'company_cash_ledger',
  'role_tool_permissions',
  'role_workflow_permissions',
] as const;

const TARGET_INDEXES = [
  {
    table: 'agent_execution_contracts',
    name: 'agent_execution_contracts_updated_at_idx',
  },
  {
    table: 'company_cash_ledger',
    name: 'company_cash_ledger_updated_at_idx',
  },
] as const;

type UpdatedAtColumnsFixupAction =
  | 'not_started'
  | 'already_applied'
  | 'schema_completed'
  | 'journal_synchronized';

export interface UpdatedAtColumnsFixupResult {
  action: UpdatedAtColumnsFixupAction;
  addedColumns: string[];
  insertedJournalEntry: boolean;
}

export async function fixupUpdatedAtColumns(
  db: LibSQLDatabase<Record<string, unknown>>,
  migrationHash: string,
): Promise<UpdatedAtColumnsFixupResult> {
  const journalState = await db.all<{ latestAppliedAt: number; targetApplied: number }>(sql`
    SELECT
      MAX(created_at) as latestAppliedAt,
      MAX(CASE WHEN created_at = ${UPDATED_AT_COLUMNS_MIGRATION_TIMESTAMP} THEN 1 ELSE 0 END)
        as targetApplied
    FROM __drizzle_migrations
  `);
  const latestAppliedAt = Number(journalState[0]?.latestAppliedAt ?? 0);
  const journalEntryExists = Number(journalState[0]?.targetApplied ?? 0) === 1;

  const existingTables: string[] = [];
  const tablesWithUpdatedAt = new Set<string>();
  for (const table of TARGET_TABLES) {
    const tableRows = await db.all<{ name: string }>(sql`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${table}
    `);
    if (tableRows.length === 0) continue;

    existingTables.push(table);
    const columns = await db.all<{ name: string }>(sql`PRAGMA table_info(${sql.raw(table)})`);
    if (columns.some((column) => column.name === 'updated_at')) {
      tablesWithUpdatedAt.add(table);
    }
  }

  const migrationHasStarted = journalEntryExists
    || latestAppliedAt >= UPDATED_AT_COLUMNS_MIGRATION_TIMESTAMP
    || tablesWithUpdatedAt.size > 0;
  if (!migrationHasStarted) {
    return { action: 'not_started', addedColumns: [], insertedJournalEntry: false };
  }

  const addedColumns: string[] = [];
  for (const table of existingTables) {
    if (tablesWithUpdatedAt.has(table)) continue;
    await db.run(sql.raw(
      `ALTER TABLE \`${table}\` ADD COLUMN \`updated_at\` integer NOT NULL DEFAULT 0`,
    ));
    addedColumns.push(`${table}.updated_at`);
  }

  for (const index of TARGET_INDEXES) {
    if (!existingTables.includes(index.table)) continue;
    await db.run(sql.raw(
      `CREATE INDEX IF NOT EXISTS \`${index.name}\` ON \`${index.table}\` (\`updated_at\`)`,
    ));
  }

  let insertedJournalEntry = false;
  if (!journalEntryExists) {
    await db.run(sql`
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES (${migrationHash}, ${UPDATED_AT_COLUMNS_MIGRATION_TIMESTAMP})
    `);
    insertedJournalEntry = true;
  }

  const action: UpdatedAtColumnsFixupAction = addedColumns.length > 0
    ? 'schema_completed'
    : insertedJournalEntry
      ? 'journal_synchronized'
      : 'already_applied';

  migrationsDebug('info', 'Updated-at columns migration state reconciled', {
    action,
    addedColumns,
    insertedJournalEntry,
  });

  return { action, addedColumns, insertedJournalEntry };
}
