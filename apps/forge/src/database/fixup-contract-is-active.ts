import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

import { migrationsDebug } from './migrations-debug';

export const CONTRACT_IS_ACTIVE_MIGRATION_TIMESTAMP = 1780585619512;

type ContractIsActiveFixupAction =
  | 'table_missing'
  | 'not_started'
  | 'column_added'
  | 'journal_synchronized'
  | 'already_applied';

export interface ContractIsActiveFixupResult {
  action: ContractIsActiveFixupAction;
  insertedJournalEntry: boolean;
}

export async function fixupContractIsActive(
  db: LibSQLDatabase<Record<string, unknown>>,
  migrationHash: string,
): Promise<ContractIsActiveFixupResult> {
  const tables = await db.all<{ name: string }>(sql`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'agent_execution_contracts'
  `);
  if (tables.length === 0) {
    return { action: 'table_missing', insertedJournalEntry: false };
  }

  const journalState = await db.all<{ latestAppliedAt: number; targetApplied: number }>(sql`
    SELECT
      MAX(created_at) as latestAppliedAt,
      MAX(CASE WHEN created_at = ${CONTRACT_IS_ACTIVE_MIGRATION_TIMESTAMP} THEN 1 ELSE 0 END)
        as targetApplied
    FROM __drizzle_migrations
  `);
  const latestAppliedAt = Number(journalState[0]?.latestAppliedAt ?? 0);
  const journalEntryExists = Number(journalState[0]?.targetApplied ?? 0) === 1;
  const columns = await db.all<{ name: string }>(sql`PRAGMA table_info(agent_execution_contracts)`);
  const columnExists = columns.some((column) => column.name === 'is_active');

  const migrationHasStarted = journalEntryExists
    || latestAppliedAt >= CONTRACT_IS_ACTIVE_MIGRATION_TIMESTAMP
    || columnExists;
  if (!migrationHasStarted) {
    return { action: 'not_started', insertedJournalEntry: false };
  }

  if (!columnExists) {
    await db.run(sql.raw(`
      ALTER TABLE agent_execution_contracts
      ADD COLUMN is_active integer NOT NULL DEFAULT 1
    `));
  }
  await db.run(sql.raw(`
    CREATE INDEX IF NOT EXISTS agent_execution_contracts_is_active_idx
    ON agent_execution_contracts (is_active)
  `));

  let insertedJournalEntry = false;
  if (!journalEntryExists) {
    await db.run(sql`
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES (${migrationHash}, ${CONTRACT_IS_ACTIVE_MIGRATION_TIMESTAMP})
    `);
    insertedJournalEntry = true;
  }

  const action: ContractIsActiveFixupAction = !columnExists
    ? 'column_added'
    : insertedJournalEntry
      ? 'journal_synchronized'
      : 'already_applied';
  migrationsDebug('info', 'Contract is-active migration state reconciled', {
    action,
    insertedJournalEntry,
  });
  return { action, insertedJournalEntry };
}
