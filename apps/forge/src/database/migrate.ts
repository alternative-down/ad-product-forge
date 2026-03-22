import { join } from 'node:path';

import { createClient } from '@libsql/client';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

import { encryptSecret } from '../encryption/crypto';
import { getAppDatabasePath } from './config';

export async function runMigrations(db: LibSQLDatabase<Record<string, unknown>>): Promise<void> {
  try {
    console.log('[Migrations] Running pending migrations for application database...');
    await repairLegacySchema();

    await migrate(db, {
      migrationsFolder: join(process.cwd(), 'migrations'),
    });

    await normalizeLlmProfiles();

    console.log('[Migrations] Migrations completed successfully');
  } catch (error) {
    console.error('[Migrations] Failed to run migrations:', error);
    throw error;
  }
}

async function repairLegacySchema() {
  const client = createClient({
    url: `file:${getAppDatabasePath()}`,
  });

  try {
    const tableInfo = await client.execute('PRAGMA table_info("llm_profiles")');

    if (tableInfo.rows.length === 0) {
      return;
    }

    const hasEncryptedApiKey = tableInfo.rows.some((row) => row.name === 'encrypted_api_key');

    if (hasEncryptedApiKey) {
      return;
    }

    console.log('[Migrations] Repairing legacy llm_profiles schema');
    await client.execute('ALTER TABLE llm_profiles ADD COLUMN encrypted_api_key text');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('no such table: llm_profiles')) {
      return;
    }

    throw error;
  } finally {
    client.close();
  }
}

async function normalizeLlmProfiles() {
  const client = createClient({
    url: `file:${getAppDatabasePath()}`,
  });

  try {
    const tableInfo = await client.execute('PRAGMA table_info("llm_profiles")');

    if (tableInfo.rows.length === 0) {
      return;
    }

    const hasEncryptedApiKey = tableInfo.rows.some((row) => row.name === 'encrypted_api_key');

    if (!hasEncryptedApiKey) {
      return;
    }

    const rows = await client.execute({
      sql: 'SELECT id, encrypted_api_key FROM llm_profiles',
      args: [],
    });
    const placeholder = encryptSecret('__oauth_gateway__');

    for (const row of rows.rows) {
      const profileId = typeof row.id === 'string' ? row.id : null;
      const encryptedApiKey = typeof row.encrypted_api_key === 'string' ? row.encrypted_api_key : null;

      if (!profileId || encryptedApiKey) {
        continue;
      }

      await client.execute({
        sql: 'UPDATE llm_profiles SET encrypted_api_key = ? WHERE id = ?',
        args: [placeholder, profileId],
      });
    }
  } finally {
    client.close();
  }
}
