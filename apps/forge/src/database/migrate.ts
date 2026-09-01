import { errorMsg } from '../agents/error-formatting';
import { migrationsDebug } from './migrations-debug';
import 'node:process';


import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getAppDatabasePath } from './config';

// ─── queryAppliedMigrations ─────────────────────────────────────────────────
/**
 * Read the most recently applied migrations from the bookkeeping table.
 *
 * Returns rows ordered by created_at desc, capped at `limit`.
 * Replaces two duplicated inline query blocks (runMigrations pre/post
 * migrations) that previously also asserted `as Array<{...}>` even
 * though `db.all<T>` already returns `T[]` (#6129 P2, L#NN-50 #33).
 */
async function queryAppliedMigrations(
  db: LibSQLDatabase<Record<string, unknown>>,
  limit: number,
): Promise<Array<{ id: number; hash: string; createdAt: number }>> {
  return await db.all<{
    id: number;
    hash: string;
    createdAt: number;
  }>(sql`
    select
      id,
      hash,
      created_at as createdAt
    from __drizzle_migrations
    order by created_at desc
    limit ${limit}
  `);
}

// ─── findMigrationsFolder ───────────────────────────────────────────────────
// Re-exported from shared module ./find-migrations-folder per issue #6761 (DRY).
// Original implementation moved there to consolidate with fixup-system-settings.ts
// duplicate. Tests at ./find-migrations-folder.test.ts (L#19 tripwire for #5674).
import { findMigrationsFolder } from './find-migrations-folder';
export { findMigrationsFolder };

// ─── cleanupFixupJournalEntry (D56 Sprint 0, #6722 retry) ────────────────────────
/**
 * Idempotent fixup for a stale journal entry left over from PR #6723's
 * startup fixup-missing-columns.ts script.
 *
 * Background (L#NN-Drizzle-Hash-Includes-Comments v1, postmortem #6725):
 * PR #6723 inserted a wrong Drizzle hash into __drizzle_migrations
 * (truncated SHA-256 of cleaned SQL, value 66ab7767753...). Drizzle's
 * readMigrationFiles actually uses SHA-256 of the FULL SQL file with
 * comments, producing 0eaf0e90... for migration 0031. The wrong-hash
 * entry had created_at 1775481600000, well before 0031's folderMillis
 * 1781902527000. Without this fixup, the migrator below would re-apply
 * 0031 (ALTER TABLE ADD COLUMN created_at), fail with 'duplicate column',
 * and crash startup with HTTP 503.
 *
 * This runs BEFORE the main loop, so by the time 0031 is reached,
 * lastDbMigration.created_at is >= 0031.folderMillis and 0031 is skipped.
 *
 * Idempotent: re-runs are no-ops if state is already correct.
 * Safe: runs on every startup, only acts if needed.
 */
async function cleanupFixupJournalEntry(
  db: LibSQLDatabase<Record<string, unknown>>,
): Promise<void> {
  const WRONG_HASH = '66ab776775372a9034465edf2720f560ebfb8343';
  const REAL_HASH_0031 = '0eaf0e90f17d12a64a579dd9e6edfb7338f3cc4ec78c6462da8fe3d9c4c262b6';
  const FOLDER_MILLIS_0031 = 1781902527000;

  const wrong = await db.all<{ id: number }>(
    sql`SELECT id FROM __drizzle_migrations WHERE hash = ${WRONG_HASH}`,
  );
  if (wrong.length > 0) {
    await db.run(
      sql`DELETE FROM __drizzle_migrations WHERE hash = ${WRONG_HASH}`,
    );
    migrationsDebug('info', 'cleanupFixupJournalEntry: removed wrong hash', { wrongHash: WRONG_HASH });
  }

  const correct = await db.all<{ id: number }>(
    sql`SELECT id FROM __drizzle_migrations WHERE hash = ${REAL_HASH_0031}`,
  );
  if (correct.length === 0) {
    await db.run(
      sql`INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES(${REAL_HASH_0031}, ${FOLDER_MILLIS_0031})`,
    );
    migrationsDebug('info', 'cleanupFixupJournalEntry: inserted correct 0031 hash', {
      hash: REAL_HASH_0031,
      folderMillis: FOLDER_MILLIS_0031,
    });
  }
}

export async function runMigrations(db: LibSQLDatabase<Record<string, unknown>>): Promise<void> {
  // Use import.meta.dirname (Node 20+, ESM) instead of process.cwd() so the
// path resolves correctly regardless of the cwd from which the app is launched.
  // Use findMigrationsFolder(import.meta.dirname) to walk up from this file to
  // the migrations folder. Works in dev (src/database/ -> apps/forge/migrations/
  // in 2 levels) and bundled (dist/database/ -> dist/migrations/ in 1 level).
  // Replaces the previous hardcoded .., .. which only worked in dev and was
  // exposed as a production bug by tsup bundling (see #5674 P0).
const migrationsFolder = findMigrationsFolder(import.meta.dirname);
  const databasePath = getAppDatabasePath();

  try {
    migrationsDebug('info', 'Starting migration run', { databasePath, cwd: process.cwd(), migrationsFolder });

    // Ensure the __drizzle_migrations bookkeeping table exists. We use the
    // same shape as drizzle's migrator so existing deployments continue to
    // work without a separate bootstrap step.
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      )
    `);

    const dbMigrations = await queryAppliedMigrations(db, 1);

    const lastDbMigration = Array.isArray(dbMigrations) ? dbMigrations[0] : undefined;
    const allMigrations = readMigrationFiles({ migrationsFolder });

    await cleanupFixupJournalEntry(db);  // D56 Sprint 0 (#6722): idempotent journal cleanup before main loop
    migrationsDebug('info', 'Applied rows before migrate', { appliedRows: Array.isArray(dbMigrations) ? dbMigrations : { error: 'query failed' } });

    // Apply each pending migration one statement at a time.
    //
    // We deliberately avoid `drizzle-orm/libsql/migrator.migrate()` here.
    // That function batches every pending statement into a single
    // `client.migrate()` call, which on `@libsql/client` 0.15.15 +
    // `libsql` 0.5.29 raises `SQLITE_OK: not an error` from the native
    // binding once a batch crosses ~27 statements — or earlier when the
    // batch contains statements that the native `Statement.run` path
    // mishandles (e.g. `CREATE UNIQUE INDEX ... WHERE` partial indexes,
    // which is what triggered this fix via migration 0026).
    //
    // Running each statement through `db.run()` keeps the libsql
    // transaction-free path and is idempotent because every DDL in the
    // migration files uses `IF NOT EXISTS` (or is naturally re-runnable
    // after a partial failure). This trades a small per-statement round
    // trip for full coverage of every migration the team writes.
    let appliedCount = 0;
    const appliedHashes: string[] = [];
    for (const migration of allMigrations) {
      if (lastDbMigration && Number(lastDbMigration.createdAt) >= migration.folderMillis) {
        continue;
      }
      for (const stmt of migration.sql) {
        const trimmed = stmt.trim();
        if (trimmed.length === 0) continue;
        await db.run(sql.raw(trimmed));
      }
      await db.run(
        sql`INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
      );
      appliedHashes.push(migration.hash.slice(0, 8));
      appliedCount += 1;
    }

    migrationsDebug('info', 'Migrations completed', {
        appliedCount,
        appliedHashes,
        totalMigrations: allMigrations.length,
      });

    const dbMigrationsAfter = await queryAppliedMigrations(db, 10);

    migrationsDebug('info', 'Applied rows after migrate', {
        appliedRows: Array.isArray(dbMigrationsAfter) ? dbMigrationsAfter : { error: 'query failed' },
        newlyApplied: appliedCount,
      });
    migrationsDebug('info', 'Migrations completed successfully');
  } catch (error) {
    migrationsDebug('error', 'Failed to run migrations', { error: errorMsg(error) });
    let appliedRowsAtFailure: unknown = { error: 'pre-init' };
    try {
      appliedRowsAtFailure = (await db.all<{ id: number; hash: string; createdAt: number }>(sql`
        select
          id,
          hash,
          created_at as createdAt
        from __drizzle_migrations
        order by created_at desc
        limit 10
      `));
    } catch (innerError) {
      appliedRowsAtFailure = { error: errorMsg(innerError) };
    }
    migrationsDebug('error', 'Applied rows at failure', { appliedRows: appliedRowsAtFailure });
    throw error;
  }
}
