import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';
import 'node:process';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getAppDatabasePath } from './config';

export async function runMigrations(db: LibSQLDatabase<Record<string, unknown>>): Promise<void> {
  // Use import.meta.dirname (Node 20+, ESM) instead of process.cwd() so the
// path resolves correctly regardless of the cwd from which the app is launched.
// The file lives at apps/forge/src/database/, so ../../migrations points to
// apps/forge/migrations. This fixes a latent production bug where launching
// the app from any directory other than apps/forge/ caused ENOENT on
// the migrations folder (see #5493).
const migrationsFolder = join(import.meta.dirname, '..', '..', 'migrations');
  const databasePath = getAppDatabasePath();

  try {
    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Running pending migrations for application database',
    });
    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Application database path',
      context: { databasePath },
    });
    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Working directory',
      context: { cwd: process.cwd() },
    });
    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Migrations folder',
      context: { migrationsFolder },
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

    const dbMigrations = (await db.all<{
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
      limit 1
    `)) as Array<{ id: number; hash: string; createdAt: number }> | { error: string };

    const lastDbMigration = Array.isArray(dbMigrations) ? dbMigrations[0] : undefined;
    const allMigrations = readMigrationFiles({ migrationsFolder });

    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Applied rows before migrate',
      context: { appliedRows: Array.isArray(dbMigrations) ? dbMigrations : { error: 'query failed' } },
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
    // transaction-free path and is idempotent because every DDL in the
    // migration files uses `IF NOT EXISTS` (or is naturally re-runnable
    // after a partial failure). This trades a small per-statement round
    // trip for full coverage of every migration the team writes.
    let appliedCount = 0;
    for (const migration of allMigrations) {
      if (lastDbMigration && Number(lastDbMigration.createdAt) >= migration.folderMillis) {
        continue;
      }
      forgeDebug({
        scope: 'migrations',
        level: 'info',
        message: 'Applying migration',
        context: { tag: migration.hash.slice(0, 8), folderMillis: migration.folderMillis },
      });
      for (const stmt of migration.sql) {
        const trimmed = stmt.trim();
        if (trimmed.length === 0) continue;
        await db.run(sql.raw(trimmed));
      }
      await db.run(
        sql`INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`
      );
      appliedCount += 1;
    }

    const dbMigrationsAfter = (await db.all<{
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
      limit 10
    `)) as Array<{ id: number; hash: string; createdAt: number }> | { error: string };

    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Applied rows after migrate',
      context: {
        appliedRows: Array.isArray(dbMigrationsAfter) ? dbMigrationsAfter : { error: 'query failed' },
        newlyApplied: appliedCount,
      },
    });
    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Migrations completed successfully',
    });
  } catch (error) {
    forgeDebug({
      scope: 'migrations',
      level: 'error',
      message: 'Failed to run migrations',
      context: { error: errorMsg(error) },
    });
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
      `)) as Array<{ id: number; hash: string; createdAt: number }>;
    } catch (innerError) {
      appliedRowsAtFailure = { error: errorMsg(innerError) };
    }
    forgeDebug({
      scope: 'migrations',
      level: 'error',
      message: 'Applied rows at failure',
      context: { appliedRows: appliedRowsAtFailure },
    });
    throw error;
  }
}
