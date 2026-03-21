/**
 * Client Drizzle + libsql - APP
 *
 * Gerencia conexão com banco de dados local via libsql (SQLite).
 */

import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { getAppDatabasePath } from './config.js';

type Database = LibSQLDatabase<typeof schema>;
const databasePath = getAppDatabasePath();
const url = `file:${databasePath}`;
const client = createClient({ url });
const db = drizzle(client, { schema });

/**
 * Obtém a instância do database
 */
export function getDatabase(): Database {
  return db;
}

export function getDatabaseClient(): Client {
  return client;
}

export { schema };
export type { Database };
