/**
 * Client Drizzle + libsql - APP
 *
 * Gerencia conexão com banco de dados local via libsql (SQLite).
 */

import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { type SQLiteTransaction } from 'drizzle-orm/sqlite-core';
import { type ExtractTablesWithRelations, sql } from 'drizzle-orm';
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

/**
 * DbOrTx — Union type for helper functions that accept either a top-level Database
 * or a SQLiteTransaction (received from db.transaction(async (tx) => ...) callbacks).
 *
 * Use this for helper function parameters that may be invoked inside or outside
 * a transaction. Eliminates the SQLiteTransaction → LibSQLDatabase TS2345 cast.
 */
type DbOrTx = Database | SQLiteTransaction<'async', unknown, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type { Database, DbOrTx };
