/**
 * Fixup script for system_settings.created_at (D56, #6722 retry)
 *
 * L#NN-32 v17: Pure function, no side-effects beyond schema correction.
 * L#NN-19 v1.2 hygiene: no env values, no secrets, deterministic output.
 *
 * CONTEXT
 * -------
 * Migration 0031 (D46, PR #5841) added `created_at` to system_settings.
 * The prod DB never got the column applied, so the admin Geral screen
 * crashed with SQLITE_ERROR no such column created_at (#6722 / #5526).
 *
 * PR #6723 (D56) tried a startup fixup with a hardcoded hash. The hash
 * was wrong because it was a truncated SHA-256 of CLEANED SQL, while
 * Drizzle actually computes SHA-256 of the FULL file with comments.
 * The wrong-hash entry caused the next migration run to attempt to
 * re-apply 0031, which would fail with duplicate column.
 *
 * This module is the SAFE remediation: a deterministic, idempotent
 * function that:
 *   1. Computes the REAL Drizzle hash for migration 0031 at runtime
 *   2. Removes any wrong-hash entry from __drizzle_migrations
 *   3. Adds the missing column if not present
 *   4. Inserts the correct journal entry if missing
 *
 * The function is exposed via POST /admin/system/fixup-columns for
 * manual operator trigger. There is NO automatic startup hook.
 *
 * L#NN-Fixup-Script-Pattern-For-Missing-Columns v2 (revised post-postmortem).
 * L#NN-Migration-Journal-Sync-After-Manual-Fix v2 (revised post-postmortem).
 */

import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { errorMsg } from '../agents/error-formatting';
import { forgeDebug } from '../admin/routes/debug';

const WRONG_HASH = '66ab776775372a9034465edf2720f560ebfb8343';
const TARGET_TABLE = 'system_settings';
const TARGET_COLUMN = 'created_at';
const MIGRATION_0031_TAG = '0031_add_created_at_to_system_settings';

/**
 * Walk up from start directory until migrations/meta/_journal.json is found.
 * Same logic as migrate.ts findMigrationsFolder — duplicated here to avoid
 * pulling the migrator module's side effects (read-only, no migration run).
 */
function findMigrationsFolder(start: string): string {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'migrations', 'meta', '_journal.json');
    if (existsSync(candidate)) return join(dir, 'migrations');
    dir = dirname(dir);
  }
  throw new Error(`migrations folder not found walking up from ${start}`);
}

/**
 * Compute the Drizzle hash for a migration tag. Mirrors the algorithm in
 * drizzle-orm/migrator.mjs: SHA-256 of the FULL SQL file content (with
 * comments and trailing newlines preserved). NOT a cleaning + truncation.
 */
function computeMigrationHash(migrationsFolder: string, tag: string): string {
  const sqlPath = join(migrationsFolder, `${tag}.sql`);
  if (!existsSync(sqlPath)) {
    throw new Error(`migration file not found: ${sqlPath}`);
  }
  const query = readFileSync(sqlPath, 'utf-8');
  return createHash('sha256').update(query).digest('hex');
}

export type FixupColumnsAction =
  | 'already_clean'
  | 'wrong_hash_removed_and_journal_synced'
  | 'wrong_hash_removed_and_column_added'
  | 'journal_synced'
  | 'column_added_and_journal_synced';

export interface FixupColumnsResult {
  ok: true;
  action: FixupColumnsAction;
  deletedWrongHash: boolean;
  addedColumn: boolean;
  insertedJournalEntry: boolean;
  computedHash: string;
  timestamp: number;
}

export interface FixupColumnsOptions {
  migrationsFolder?: string;
  timestamp?: number;
}

/**
 * Idempotent fixup for system_settings.created_at column drift.
 *
 * State machine (5 reachable states):
 *
 * 1. already_clean
 *    Column exists AND real hash in journal AND no wrong hash.
 *    No-op.
 *
 * 2. wrong_hash_removed_and_journal_synced
 *    Column exists AND real hash MISSING AND wrong hash present.
 *    DELETE wrong hash + INSERT real hash.
 *
 * 3. wrong_hash_removed_and_column_added
 *    Column MISSING AND wrong hash present (post-revert state).
 *    DELETE wrong hash + ALTER TABLE ADD COLUMN + INSERT real hash.
 *
 * 4. journal_synced
 *    Column exists AND real hash MISSING AND no wrong hash.
 *    INSERT real hash.
 *
 * 5. column_added_and_journal_synced
 *    Column MISSING AND no wrong hash.
 *    ALTER TABLE ADD COLUMN + INSERT real hash.
 */
export async function fixupSystemSettingsCreatedAt(
  db: LibSQLDatabase<Record<string, unknown>>,
  options: FixupColumnsOptions = {},
): Promise<FixupColumnsResult> {
  const timestamp = options.timestamp ?? Date.now();

  // Resolve migrations folder (runtime-friendly: walks up from cwd).
  const migrationsFolder = options.migrationsFolder ?? findMigrationsFolder(process.cwd());
  const realHash = computeMigrationHash(migrationsFolder, MIGRATION_0031_TAG);

  const colRows = await db.all<{ name: string }>(
    sql`PRAGMA table_info(${sql.raw(`'${TARGET_TABLE}'`)})`,
  );
  const columnExists = colRows.some((r) => r.name === TARGET_COLUMN);

  const journalRows = await db.all<{ hash: string }>(
    sql`SELECT hash FROM __drizzle_migrations WHERE hash IN (${realHash}, ${WRONG_HASH})`,
  );
  const realHashInJournal = journalRows.some((r) => r.hash === realHash);
  const wrongHashInJournal = journalRows.some((r) => r.hash === WRONG_HASH);

  // State 1: already_clean
  if (columnExists && realHashInJournal && !wrongHashInJournal) {
    forgeDebug({
      scope: 'database-fixup',
      level: 'info',
      message: 'fixup no-op (column present, real hash in journal, no wrong hash)',
      context: { table: TARGET_TABLE, column: TARGET_COLUMN, computedHash: realHash },
    });
    return {
      ok: true,
      action: 'already_clean',
      deletedWrongHash: false,
      addedColumn: false,
      insertedJournalEntry: false,
      computedHash: realHash,
      timestamp,
    };
  }

  let deletedWrongHash = false;
  let addedColumn = false;
  let insertedJournalEntry = false;

  // Step 1: DELETE wrong hash if present (idempotent)
  if (wrongHashInJournal) {
    try {
      await db.run(
        sql`DELETE FROM __drizzle_migrations WHERE hash = ${WRONG_HASH}`,
      );
      deletedWrongHash = true;
    } catch (err) {
      forgeDebug({
        scope: 'database-fixup',
        level: 'error',
        message: 'fixup: failed to delete wrong hash',
        context: { error: errorMsg(err), wrongHash: WRONG_HASH },
      });
      throw err;
    }
  }

  // Step 2: ALTER TABLE if column missing
  if (!columnExists) {
    try {
      await db.run(
        sql`ALTER TABLE ${sql.raw(TARGET_TABLE)} ADD COLUMN ${sql.raw(TARGET_COLUMN)} integer NOT NULL DEFAULT (unixepoch())`,
      );
      addedColumn = true;
    } catch (err) {
      forgeDebug({
        scope: 'database-fixup',
        level: 'error',
        message: 'fixup: failed to add column',
        context: { error: errorMsg(err), table: TARGET_TABLE, column: TARGET_COLUMN },
      });
      throw err;
    }
  }

  // Step 3: INSERT real hash if not present
  if (!realHashInJournal) {
    try {
      await db.run(
        sql`INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES(${realHash}, ${timestamp})`,
      );
      insertedJournalEntry = true;
    } catch (err) {
      forgeDebug({
        scope: 'database-fixup',
        level: 'error',
        message: 'fixup: failed to insert correct hash',
        context: { error: errorMsg(err), realHash },
      });
      throw err;
    }
  }

  // Determine final action label
  let action: FixupColumnsAction;
  if (deletedWrongHash && addedColumn) {
    action = 'wrong_hash_removed_and_column_added';
  } else if (deletedWrongHash) {
    action = 'wrong_hash_removed_and_journal_synced';
  } else if (addedColumn) {
    action = 'column_added_and_journal_synced';
  } else {
    action = 'journal_synced';
  }

  forgeDebug({
    scope: 'database-fixup',
    level: 'info',
    message: `fixup applied: ${action}`,
    context: {
      action,
      table: TARGET_TABLE,
      column: TARGET_COLUMN,
      computedHash: realHash,
      deletedWrongHash,
      addedColumn,
      insertedJournalEntry,
    },
  });

  return {
    ok: true,
    action,
    deletedWrongHash,
    addedColumn,
    insertedJournalEntry,
    computedHash: realHash,
    timestamp,
  };
}
