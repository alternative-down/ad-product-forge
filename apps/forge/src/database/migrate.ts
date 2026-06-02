import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';
import 'node:process';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { getAppDatabasePath } from './config';

export async function runMigrations(db: LibSQLDatabase<Record<string, unknown>>): Promise<void> {
  const migrationsFolder = join(process.cwd(), 'migrations');
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
    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Applied rows before migrate',
      context: { appliedRows: await getAppliedMigrationRows(db) },
    });

    await migrate(db, {
      migrationsFolder,
    });

    forgeDebug({
      scope: 'migrations',
      level: 'info',
      message: 'Applied rows after migrate',
      context: { appliedRows: await getAppliedMigrationRows(db) },
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
    forgeDebug({
      scope: 'migrations',
      level: 'error',
      message: 'Applied rows at failure',
      context: { appliedRows: await getAppliedMigrationRows(db) },
    });
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
    forgeDebug({
      scope: 'migrations',
      level: 'error',
      message: 'getAppliedMigrationRows failed',
      context: { error: errorMsg(error) },
    });
    return {
      error: errorMsg(error),
    };
  }
}
