/**
 * Client Drizzle + libsql
 *
 * Gerencia conexão com banco de dados via libsql.
 * Preparado para local (SQLite) e remoto (Turso).
 */

import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { getLibsqlUrl, getLibsqlToken, getAppDatabasePath } from './config';

type Database = LibSQLDatabase<typeof schema>;

let dbInstance: Database | null = null;

/**
 * Inicializa a conexão com o banco de dados
 */
function initializeDatabase(): Database {
  const databasePath = getAppDatabasePath();
  const url = getLibsqlUrl(databasePath);
  const token = getLibsqlToken();

  const client = createClient({
    url,
    authToken: token,
  });

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
