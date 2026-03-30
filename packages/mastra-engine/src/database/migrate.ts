import { join } from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

/**
 * Executes pending database migrations
 * This function should be called when initializing the communication module
 *
 * @param db - The Drizzle database instance with schema
 * @throws Error if migration fails
 */
export async function runMigrations<T extends Record<string, unknown> = Record<string, unknown>>(db: LibSQLDatabase<T>): Promise<void> {
  try {
    console.log('[Migrations] Running pending migrations for communication database...');
    const migrationsPath = join(process.cwd(), '..', '..', 'packages', 'mastra-engine', 'migrations');

    await ensureLegacyAgentSchedulesTable(db);
    await migrate(db, {
      migrationsFolder: migrationsPath,
    });

    console.log('[Migrations] Migrations completed successfully');
  } catch (error) {
    console.error('[Migrations] Failed to run migrations:', error);
    throw error;
  }
}

async function ensureLegacyAgentSchedulesTable<
  T extends Record<string, unknown> = Record<string, unknown>,
>(db: LibSQLDatabase<T>) {
  const existingTables = await db.all<{ name: string }>(`
    select name
    from sqlite_master
    where type = 'table' and name = 'agent_schedules'
  `);

  if (existingTables.length > 0) {
    return;
  }

  console.log('[Migrations] Creating legacy agent_schedules table for issue225 compatibility');
  await db.run(`
    create table if not exists agent_schedules (
      id text primary key not null,
      agent_id text not null,
      kind text not null default 'agent',
      name text not null,
      description text,
      schedule_type text not null,
      cron_expression text,
      scheduled_date integer,
      timezone text not null,
      content text not null,
      is_active integer not null default 1,
      last_triggered_at integer,
      next_trigger_at integer,
      creator_id text,
      created_at integer not null,
      updated_at integer not null
    )
  `);
}
