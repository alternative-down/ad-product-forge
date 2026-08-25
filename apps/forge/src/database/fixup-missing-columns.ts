/**
 * Schema Fixup Script for Missing Columns (D56 11:36Z, #6722)
 *
 * L#NN-32 v17: Pure function, no side-effects beyond schema correction.
 * L#NN-19 v1.2 hygiene: no env values, no secrets, deterministic output.
 *
 * CONTEXT
 * -------
 * Migration 0031_add_created_at_to_system_settings.sql adds the `created_at`
 * column to system_settings. It was merged at commit e4e9f5cb (PR #5841, D46).
 * However, the prod DB on develop (deployment 396871e) does NOT have the
 * column, causing the admin config screen "Geral" to crash with
 * `SQLITE_ERROR: no such column: created_at`.
 *
 * WHY A FIXUP SCRIPT INSTEAD OF A NEW MIGRATION
 * ----------------------------------------------
 * SQLite does not support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. The
 * migration runner aborts the whole transaction on a failed statement, so
 * a "best effort" migration via the normal path would either:
 * - Fail the entire app startup (bad)
 * - Get marked as applied without actually adding the column (worse)
 *
 * A separate fixup script is the safe pattern for schema corrections:
 * - Idempotent: re-running is safe (PRAGMA check + journal upsert guard)
 * - Synced journal: after adding the column, INSERTs into __drizzle_migrations
 *   with the migration 0031 hash so the journal stays in sync. Future deploys
 *   won't try to re-apply 0031 (which would fail because the column exists).
 *
 * CALLED FROM
 * -----------
 * `apps/forge/src/forge-bootstrap.ts` immediately after `runMigrations(db)`.
 * Runs on every app startup. Idempotent.
 *
 * L#NN-Fixup-Script-Pattern-For-Missing-Columns v1 N=1 EMPIRICAL.
 * L#NN-Migration-Journal-Sync-After-Manual-Fix v1 DRAFT.
 */

import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { errorMsg } from '../agents/error-formatting';
import { forgeDebug } from '../admin/routes/debug';
import * as schema from './schema';

// SHA-256 hash of the cleaned SQL content of migration 0031.
// Pre-computed so we don't read the file at runtime (L#NN-19 hygiene:
// avoid filesystem reads in production code paths).
//
// To recompute:
//   node -e 'const fs=require("fs"),c=require("crypto");
//            const sql=fs.readFileSync("0031_add_created_at_to_system_settings.sql","utf8")
//              .replace(/-->.*?$/gm,"").replace(/--.*?$/gm,"").trim();
//            console.log(c.createHash("sha256").update(sql).digest("hex").slice(0,40));'
const MIGRATION_0031_HASH = '66ab776775372a9034465edf2720f560ebfb8343';
const MIGRATION_0031_WHEN_MS = 1775481600000; // ~ D46 epoch (approximate)

const TARGET_TABLE = 'system_settings';
const TARGET_COLUMN = 'created_at';

interface FixupResult {
  ranFixup: boolean;
  reason: 'column_present' | 'column_added' | 'journal_already_synced' | 'column_added_and_journal_synced';
  timestamp: number;
}

async function columnExists(
  db: LibSQLDatabase<typeof schema>,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await db.all<{ name: string }>(sql`PRAGMA table_info(${sql.raw(`'${table}'`)})`);
  return rows.some((r) => r.name === column);
}

async function migrationApplied(
  db: LibSQLDatabase<typeof schema>,
  hash: string,
): Promise<boolean> {
  const rows = await db.all<{ id: number }>(
    sql`SELECT id FROM __drizzle_migrations WHERE hash = ${hash} LIMIT 1`,
  );
  return rows.length > 0;
}

export async function fixupMissingColumns(
  db: LibSQLDatabase<typeof schema>,
): Promise<FixupResult> {
  const timestamp = Date.now();

  const colExists = await columnExists(db, TARGET_TABLE, TARGET_COLUMN);
  const journalHasIt = await migrationApplied(db, MIGRATION_0031_HASH);

  if (colExists && journalHasIt) {
    // Healthy state: column present + journal synced. No-op.
    return { ranFixup: false, reason: 'column_present', timestamp };
  }

  if (colExists && !journalHasIt) {
    // Column exists but journal doesn't know about migration 0031.
    // Sync the journal only (no ALTER TABLE needed).
    await db.run(
      sql`INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES(${MIGRATION_0031_HASH}, ${MIGRATION_0031_WHEN_MS})`,
    );
    forgeDebug({
      scope: 'database-fixup',
      level: 'info',
      message: 'fixup: journal synced for migration 0031 (column already present)',
      context: { table: TARGET_TABLE, column: TARGET_COLUMN, hash: MIGRATION_0031_HASH },
    });
    return { ranFixup: true, reason: 'journal_already_synced', timestamp };
  }

  if (!colExists && journalHasIt) {
    // Anomalous: journal says migration 0031 was applied but column is missing.
    // This is the prod state we're fixing. Add the column WITHOUT touching
    // the journal (it already has the entry, so re-INSERT would conflict).
    await db.run(
      sql`ALTER TABLE ${sql.raw(TARGET_TABLE)} ADD COLUMN ${sql.raw(TARGET_COLUMN)} integer NOT NULL DEFAULT (unixepoch())`,
    );
    forgeDebug({
      scope: 'database-fixup',
      level: 'info',
      message: 'fixup: column added (journal was already synced)',
      context: { table: TARGET_TABLE, column: TARGET_COLUMN, hash: MIGRATION_0031_HASH },
    });
    return { ranFixup: true, reason: 'column_added', timestamp };
  }

  // Neither column nor journal entry: full fixup.
  await db.run(
    sql`ALTER TABLE ${sql.raw(TARGET_TABLE)} ADD COLUMN ${sql.raw(TARGET_COLUMN)} integer NOT NULL DEFAULT (unixepoch())`,
  );
  await db.run(
    sql`INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES(${MIGRATION_0031_HASH}, ${MIGRATION_0031_WHEN_MS})`,
  );
  forgeDebug({
    scope: 'database-fixup',
    level: 'info',
    message: 'fixup: column added AND journal synced',
    context: { table: TARGET_TABLE, column: TARGET_COLUMN, hash: MIGRATION_0031_HASH },
  });
  return { ranFixup: true, reason: 'column_added_and_journal_synced', timestamp };
}
