/**
 * Client Drizzle + libsql - APP
 *
 * Gerencia conexão com banco de dados local via libsql (SQLite).
 */

import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { getAppDatabasePath } from './config';

type Database = LibSQLDatabase<typeof schema>;

let dbInstance: Database | null = null;

/**
 * Inicializa a conexão com o banco de dados local
 */
function initializeDatabase(): Database {
  const databasePath = getAppDatabasePath();
  const url = `file:${databasePath}`;

  const client = createClient({ url });

  return drizzle(client, { schema });
}

/**
 * Obtém a instância do database (lazy initialization)
 */
export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = initializeDatabase();
  }
  return dbInstance;
}

export { schema };
export type { Database };
