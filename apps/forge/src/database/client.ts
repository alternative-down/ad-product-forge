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

// SQLite PRAGMA set for production-grade concurrency and write performance.
//
// foreign_keys: enforce ON DELETE CASCADE constraints (schema requires this).
// busy_timeout: wait up to 5s for a lock instead of returning SQLITE_BUSY
//               immediately under contention (migrations, cross-store joins).
// journal_mode: enable Write-Ahead Logging so N readers and 1 writer can
//               operate concurrently. Default DELETE mode serializes all access.
// synchronous:  relax full fsync to fsync only at checkpoint. ~10-100x faster
//               writes with the documented tradeoff that the last transaction
//               may be lost on power failure; the database itself stays consistent.
//
// All four PRAGMAs are connection-level configuration. They must be awaited
// during bootstrap: starting them at module scope turns an SQLite rejection
// into an unhandled promise rejection before startup can report the cause.
export async function configureDatabaseConnection(): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys = ON`);
  await db.run(sql`PRAGMA busy_timeout = 5000`);
  await db.run(sql`PRAGMA journal_mode = WAL`);
  await db.run(sql`PRAGMA synchronous = NORMAL`);
}

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
