/**
 * Communication module database initialization
 *
 * Handles ONLY database schema initialization (migrations)
 * Does NOT create the store or client
 */

import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import type { Client } from '@libsql/client';
import { runMigrations } from '../../database/migrate';
import * as communicationSchema from './schema';

type CommunicationDatabase = LibSQLDatabase<typeof communicationSchema>;

/**
 * Initialize communication database schema (run migrations)
 * This should be called once during application startup before using the store
 *
 * @param client - The libSQL client (already created)
 * @returns Drizzle database instance for use with store operations
 * @throws Error if migrations fail
 */
export async function initializeCommunicationDatabase(
  client: Client,
): Promise<CommunicationDatabase> {
  try {
    console.log('[Communication] Initializing communication database...');

    // Create Drizzle instance with communication schema
    const db = drizzle(client, { schema: communicationSchema });

    // Run all pending migrations
    await runMigrations(db);

    console.log('[Communication] Database initialized successfully');
    return db;
  } catch (error) {
    console.error('[Communication] Failed to initialize database:', error);
    throw error;
  }
}

export type { CommunicationDatabase };
