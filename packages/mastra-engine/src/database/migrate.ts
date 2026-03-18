import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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

    // Get absolute path to migrations folder
    // migrations/ is at the root of packages/mastra-engine/
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile); // src/database/
    const packageRoot = dirname(dirname(currentDir)); // packages/mastra-engine/
    const migrationsPath = join(packageRoot, 'migrations');

    await migrate(db, {
      migrationsFolder: migrationsPath,
    });

    console.log('[Migrations] Migrations completed successfully');
  } catch (error) {
    console.error('[Migrations] Failed to run migrations:', error);
    throw error;
  }
}
