import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { getDatabaseClient } from './client.js';

/**
 * Initializes the application schema on an empty database.
 * This project is still pre-production, so the runtime uses a single
 * baseline schema instead of replaying a long migration history.
 */
export async function runMigrations(): Promise<void> {
  const client = getDatabaseClient();

  try {
    const agentsTable = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agents' LIMIT 1",
    );

    if (agentsTable.rows.length > 0) {
      console.log('[Migrations] Schema already initialized');
      return;
    }

    console.log('[Migrations] Initializing application database schema...');

    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile);
    const appRoot = dirname(dirname(currentDir));
    const baselinePath = join(appRoot, 'migrations', '0000_familiar_boomerang.sql');
    const baselineSql = await readFile(baselinePath, 'utf8');
    const statements = baselineSql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    await client.execute('PRAGMA foreign_keys = OFF');
    await client.execute('BEGIN');

    try {
      for (const statement of statements) {
        await client.execute(statement);
      }

      await client.execute('COMMIT');
    } catch (error) {
      await client.execute('ROLLBACK');
      throw error;
    } finally {
      await client.execute('PRAGMA foreign_keys = ON');
    }

    console.log('[Migrations] Schema initialized successfully');
  } catch (error) {
    console.error('[Migrations] Failed to initialize schema:', error);
    throw error;
  }
}
