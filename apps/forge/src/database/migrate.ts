import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getAppDatabasePath } from './config';

export async function runMigrations(db: LibSQLDatabase<Record<string, unknown>>): Promise<void> {
  const migrationsFolder = join(process.cwd(), 'migrations');
  const databasePath = getAppDatabasePath();

  try {
    console.log('[Migrations] Running pending migrations for application database...');
    console.log('[Migrations] Application database path:', databasePath);
    console.log('[Migrations] Working directory:', process.cwd());
    console.log('[Migrations] Migrations folder:', migrationsFolder);

    // Note: Migration tracking table (__drizzle_migrations) had corruption from
    // duplicate 0027_ migration file prefix. This was fixed by renaming one file to 0028_.
    // Any remaining tracking issues are handled by migration 0030_fix_migration_tracking.sql.

    console.log('[Migrations] Applied rows before migrate:', await getAppliedMigrationRows(db));

    await migrate(db, {
      migrationsFolder,
    });

    console.log('[Migrations] Applied rows after migrate:', await getAppliedMigrationRows(db));
    console.log('[Migrations] Migrations completed successfully');
  } catch (error) {
    console.error('[Migrations] Failed to run migrations:', error);
    console.error('[Migrations] Applied rows at failure:', await getAppliedMigrationRows(db));
    throw error;
  }
}

async function getAppliedMigrationRows(db: LibSQLDatabase<Record<string, unknown>>) {
  try {
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
      limit 10
    `);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
