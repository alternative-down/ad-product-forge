/**
 * Client Drizzle + libsql - APP
 *
 * Gerencia conexão com banco de dados agents.db via libsql.
 * Preparado para local (SQLite) e remoto (Turso).
 */

import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { getAppDatabasePath } from './config';

type Database = LibSQLDatabase<typeof schema>;

let dbInstance: Database | null = null;

/**
 * Constrói URL de conexão libsql
 * Para local: file:path
 * Para Turso: https://...
 */
function getLibsqlUrl(databasePath: string): string {
  // Local development
  if (!process.env.TURSO_CONNECTION_URL) {
    return `file:${databasePath}`;
  }

  // Production with Turso
  return process.env.TURSO_CONNECTION_URL;
}

/**
 * Token de autenticação (para Turso)
 */
function getLibsqlToken(): string | undefined {
  return process.env.TURSO_AUTH_TOKEN;
}

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
