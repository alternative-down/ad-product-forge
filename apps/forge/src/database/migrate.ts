import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';
import 'node:process';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getAppDatabasePath } from './config';

/**
 * Walk up from start directory until a migrations/meta/_journal.json is found.
 * Handles both dev (src/database/ -> apps/forge/migrations/) and bundled
 * (dist/database/ -> dist/migrations/) layouts, as well as any future layout
 * drift. Pure runtime, no build-config coupling. (Refs #5674)
 */
export function findMigrationsFolder(start: string): string {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'migrations', 'meta', '_journal.json');
    if (existsSync(candidate)) return join(dir, 'migrations');
    dir = dirname(dir);
  }
  throw new Error(`migrations/meta/_journal.json not found above ${start} (walked 5 levels)`);
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
    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Starting migration run',
      context: { databasePath, cwd: process.cwd(), migrationsFolder },
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
    `)) as Array<{ id: number; hash: string; createdAt: number }>;

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

    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Migrations completed',
      context: {
        appliedCount,
        appliedHashes,
        totalMigrations: allMigrations.length,
      },
    });

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
    `)) as Array<{ id: number; hash: string; createdAt: number }>;

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
      `));
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
