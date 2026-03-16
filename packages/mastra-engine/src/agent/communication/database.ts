/**
 * Communication module database initialization
 *
 * Handles database setup for communication features:
 * - Runs migrations
 * - Returns initialized store
 *
 * NOTE: Migrations must be run before using the store
 */

import type { Client } from '@libsql/client';
import { runMigrations } from '../../database/migrate';
import { createCommunicationStore } from './store';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as communicationSchema from './schema';

type CommunicationDatabase = LibSQLDatabase<typeof communicationSchema>;

/**
 * Initializes the communication database
 * - Runs all pending migrations
 * - Creates the communication store
 *
 * @param client - The libSQL client
 * @returns Object with db instance and store
 */
export async function initializeCommunicationDatabase(client: Client) {
  // Create Drizzle instance for migrations
  const db = drizzle(client, { schema: communicationSchema }) as CommunicationDatabase;

  // Run all pending migrations
  await runMigrations(db);

  // Create store (uses client directly for raw SQL operations)
  const store = await createCommunicationStore(client);

  return {
    db,
    store,
  };
}

export type { CommunicationDatabase };
