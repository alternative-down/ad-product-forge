import { join } from 'node:path';

import { migrate } from 'drizzle-orm/libsql/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

export async function runMigrations(db: LibSQLDatabase<Record<string, unknown>>): Promise<void> {
  try {
    console.log('[Migrations] Running pending migrations for application database...');

    await migrate(db, {
      migrationsFolder: join(process.cwd(), 'migrations'),
    });

    console.log('[Migrations] Migrations completed successfully');
  } catch (error) {
    console.error('[Migrations] Failed to run migrations:', error);
    throw error;
  }
}
