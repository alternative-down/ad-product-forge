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

export function getCommunicationDatabase(client: Client): CommunicationDatabase {
  return drizzle(client, { schema: communicationSchema });
}

export async function initializeCommunicationDatabase(client: Client): Promise<CommunicationDatabase> {
  try {
    console.log('[Communication] Initializing communication database...');
    const db = getCommunicationDatabase(client);

    await runMigrations(db);

    console.log('[Communication] Database initialized successfully');
    return db;
  } catch (error) {
    console.error('[Communication] Failed to initialize database:', error);
    throw error;
  }
}

export type { CommunicationDatabase };
