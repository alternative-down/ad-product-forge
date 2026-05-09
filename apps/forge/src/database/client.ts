/**
 * Client Drizzle + libsql - APP
 *
 * Gerencia conexão com banco de dados local via libsql (SQLite).
 */

import { createClient } from '@libsql/client';
import { drizzle, sql, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { getAppDatabasePath } from './config';

type Database = LibSQLDatabase<typeof schema>;
const databasePath = getAppDatabasePath();
const url = `file:${databasePath}`;
const client = createClient({ url });
const db = drizzle(client, { schema });

// Enable foreign key enforcement at the connection level.
// Without this, SQLite ignores ON DELETE CASCADE constraints defined in the schema.
db.run(sql`PRAGMA foreign_keys = ON`);

/**
 * Obtém a instância do database
 */
export function getDatabase(): Database {
  return db;
}

export type { Database };
