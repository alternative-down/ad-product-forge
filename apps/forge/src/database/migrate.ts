import { errorMsg } from '../agents/error-formatting';
import { migrationsDebug } from './migrations-debug';
import 'node:process';

import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getAppDatabasePath } from './config';
import {
  fixupSystemSettingsCreatedAt,
  SYSTEM_SETTINGS_CREATED_AT_MIGRATION_TIMESTAMP,
} from './fixup-system-settings';
import {
  fixupWebhookSecretColumns,
  WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP,
} from './fixup-webhook-secret-columns';
import {
  fixupUpdatedAtColumns,
  UPDATED_AT_COLUMNS_MIGRATION_TIMESTAMP,
} from './fixup-updated-at-columns';

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

async function systemSettingsTableExists(db: LibSQLDatabase<Record<string, unknown>>) {
  const rows = await db.all<{ name: string }>(sql`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'system_settings'
  `);
  return rows.length > 0;
}

// ─── findMigrationsFolder ───────────────────────────────────────────────────
// Re-exported from shared module ./find-migrations-folder per issue #6761 (DRY).
// Original implementation moved there to consolidate with fixup-system-settings.ts
// duplicate. Tests at ./find-migrations-folder.test.ts (L#19 tripwire for #5674).
import { findMigrationsFolder } from './find-migrations-folder';
export { findMigrationsFolder };

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
    migrationsDebug('info', 'Starting migration run', {
      databasePath,
      cwd: process.cwd(),
      migrationsFolder,
    });

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

    if (await systemSettingsTableExists(db)) {
      await fixupSystemSettingsCreatedAt(db, { migrationsFolder });
    }

    const allMigrations = readMigrationFiles({ migrationsFolder });
    const updatedAtColumnsMigration = allMigrations.find(
      (migration) => migration.folderMillis === UPDATED_AT_COLUMNS_MIGRATION_TIMESTAMP,
    );
    if (updatedAtColumnsMigration) {
      await fixupUpdatedAtColumns(db, updatedAtColumnsMigration.hash);
    }
    const webhookSecretColumnsMigration = allMigrations.find(
      (migration) => migration.folderMillis === WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP,
    );
    if (webhookSecretColumnsMigration) {
      await fixupWebhookSecretColumns(db, webhookSecretColumnsMigration.hash);
    }

    const dbMigrations = await queryAppliedMigrations(db, 1);
    const lastDbMigration = Array.isArray(dbMigrations) ? dbMigrations[0] : undefined;

    migrationsDebug('info', 'Applied rows before migrate', {
      appliedRows: Array.isArray(dbMigrations) ? dbMigrations : { error: 'query failed' },
    });

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
    // transaction-free path. Migrations with non-idempotent multi-statement
    // ALTER TABLE operations require a targeted state reconciliation before
    // this loop so a process interruption cannot create a permanent restart
    // loop. This trades a small per-statement round trip for full coverage of
    // every migration the team writes.
    let appliedCount = 0;
    const appliedHashes: string[] = [];
    for (const migration of allMigrations) {
      if (lastDbMigration && Number(lastDbMigration.createdAt) >= migration.folderMillis) {
        continue;
      }
      if (migration.folderMillis === SYSTEM_SETTINGS_CREATED_AT_MIGRATION_TIMESTAMP) {
        await fixupSystemSettingsCreatedAt(db, { migrationsFolder });
        appliedHashes.push(migration.hash.slice(0, 8));
        appliedCount += 1;
        continue;
      }
      for (const stmt of migration.sql) {
        const trimmed = stmt.trim();
        if (trimmed.length === 0) continue;
        await db.run(sql.raw(trimmed));
      }
      await db.run(
        sql`INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
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
      appliedRowsAtFailure = await db.all<{ id: number; hash: string; createdAt: number }>(sql`
        select
          id,
          hash,
          created_at as createdAt
        from __drizzle_migrations
        order by created_at desc
        limit 10
      `);
    } catch (innerError) {
      appliedRowsAtFailure = { error: errorMsg(innerError) };
    }
    migrationsDebug('error', 'Applied rows at failure', { appliedRows: appliedRowsAtFailure });
    throw error;
  }
}
