/**
 * Communication module libsql Client management
 *
 * Creates and manages the libSQL client for the communication database
 */

import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import { getCommunicationDatabasePath, getLibsqlUrl, getLibsqlToken } from '../../database/config';

/**
 * Creates a libSQL client for the communication module
 * Uses local SQLite (communication.db) by default, supports Turso in production
 *
 * @returns Configured libSQL client
 */
export function createCommunicationClient(): Client {
  const databasePath = getCommunicationDatabasePath();
  const url = getLibsqlUrl(databasePath);
  const token = getLibsqlToken();

  return createClient({
    url,
    authToken: token,
  });
}

/**
 * Singleton instance (lazy-loaded)
 */
let clientInstance: Client | null = null;

/**
 * Gets or creates the communication client (singleton)
 */
export function getCommunicationClient(): Client {
  if (!clientInstance) {
    clientInstance = createCommunicationClient();
  }
  return clientInstance;
}
