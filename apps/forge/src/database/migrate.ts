import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LibSQLDatabase } from 'drizzle-orm/libsql';

type SqliteRow = Record<string, unknown>;

type SqliteClient = {
  execute(statement: string): Promise<{
    rows: SqliteRow[];
  }>;
};

function getSqliteClient(db: LibSQLDatabase<Record<string, unknown>>) {
  const candidate = (db as unknown as { $client?: SqliteClient }).$client;

  if (!candidate) {
    throw new Error('Database client unavailable for migrations');
  }

  return candidate;
}

async function ensureMigrationsTable(db: LibSQLDatabase<Record<string, unknown>>) {
  const client = getSqliteClient(db);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);
}

async function listAppliedMigrationHashes(db: LibSQLDatabase<Record<string, unknown>>) {
  const client = getSqliteClient(db);
  const result = await client.execute('SELECT hash FROM "__drizzle_migrations"');
  return new Set(
    result.rows
      .map((row) => row.hash)
      .filter((hash): hash is string => typeof hash === 'string'),
  );
}

function splitMigrationStatements(source: string) {
  return source
    .split('--> statement-breakpoint')
    .flatMap((statementBlock) =>
      statementBlock
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => `${statement};`),
    )
    .filter(Boolean);
}

function createMigrationHash(fileName: string, source: string) {
  return createHash('sha256').update(`${fileName}:${source}`).digest('hex');
}

async function applyMigrationFile(
  db: LibSQLDatabase<Record<string, unknown>>,
  fileName: string,
  filePath: string,
  appliedHashes: Set<string>,
) {
  const source = await readFile(filePath, 'utf8');
  const hash = createMigrationHash(fileName, source);

  if (appliedHashes.has(hash)) {
    return;
  }

  const statements = splitMigrationStatements(source);
  const client = getSqliteClient(db);

  for (const statement of statements) {
    await client.execute(statement);
  }

  await client.execute(`
    INSERT INTO "__drizzle_migrations" ("hash", "created_at")
    VALUES ('${hash}', ${Date.now()})
  `);

  appliedHashes.add(hash);
}

export async function runMigrations(db: LibSQLDatabase<Record<string, unknown>>): Promise<void> {
  try {
    console.log('[Migrations] Running pending migrations for application database...');

    const migrationsPath = join(process.cwd(), 'migrations');

    const migrationFiles = (await readdir(migrationsPath))
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort();

    await ensureMigrationsTable(db);

    const appliedHashes = await listAppliedMigrationHashes(db);

    for (const fileName of migrationFiles) {
      await applyMigrationFile(db, fileName, join(migrationsPath, fileName), appliedHashes);
    }

    console.log('[Migrations] Migrations completed successfully');
  } catch (error) {
    console.error('[Migrations] Failed to run migrations:', error);
    throw error;
  }
}
