import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

/**
 * Executes pending database migrations for application database
 * This function should be called during application initialization
 *
 * @param db - The Drizzle database instance
 * @throws Error if migration fails
 */
export async function runMigrations(db: LibSQLDatabase): Promise<void> {
  try {
    console.log('[Migrations] Running pending migrations for application database...');

    // Get absolute path to migrations folder
    // migrations/ is at the root of apps/forge/
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile); // src/database/
    const appRoot = dirname(dirname(currentDir)); // apps/forge/
    const migrationsPath = join(appRoot, 'migrations');

    await migrate(db, {
      migrationsFolder: migrationsPath,
    });

    console.log('[Migrations] Migrations completed successfully');
  } catch (error) {
    console.error('[Migrations] Failed to run migrations:', error);
    throw error;
  }
}
