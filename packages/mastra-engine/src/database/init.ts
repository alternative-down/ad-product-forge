import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { drizzle } from 'drizzle-orm/libsql';
import type { Client } from '@libsql/client';
import { runMigrations } from './migrate';

/**
 * Initializes the communication database with Drizzle ORM
 * Runs all pending migrations automatically
 *
 * @param client - The libSQL client
 * @returns A Drizzle database instance with all migrations applied
 */
export async function initializeCommunicationDatabase(
  client: Client,
): Promise<LibSQLDatabase> {
  // Create Drizzle instance
  const db = drizzle(client);

  // Run migrations
  await runMigrations(db);

  return db;
}
