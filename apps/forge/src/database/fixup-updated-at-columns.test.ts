import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, describe, expect, it } from 'vitest';

import {
  fixupUpdatedAtColumns,
  UPDATED_AT_COLUMNS_MIGRATION_TIMESTAMP,
} from './fixup-updated-at-columns';

const clients: Client[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.close();
});

async function createDatabase(latestMigration?: number) {
  const client = createClient({ url: ':memory:' });
  clients.push(client);
  await client.execute(`
    CREATE TABLE __drizzle_migrations (
      id INTEGER PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);
  if (latestMigration !== undefined) {
    await client.execute({
      sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
      args: ['existing-migration', latestMigration],
    });
  }
  return { client, db: drizzle(client) as LibSQLDatabase<Record<string, unknown>> };
}

async function createTargetTables(client: Client) {
  for (const table of [
    'agent_providers',
    'agent_execution_contracts',
    'agent_execution_steps',
    'agent_notifications',
    'company_cash_ledger',
    'role_tool_permissions',
    'role_workflow_permissions',
  ]) {
    await client.execute(`CREATE TABLE ${table} (id text PRIMARY KEY)`);
  }
}

async function hasUpdatedAt(client: Client, table: string) {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === 'updated_at');
}

describe('fixupUpdatedAtColumns', () => {
  it('leaves a fresh installation for the normal migrator', async () => {
    const { client, db } = await createDatabase();
    await createTargetTables(client);

    const result = await fixupUpdatedAtColumns(db, 'target-hash');

    expect(result.action).toBe('not_started');
    expect(await hasUpdatedAt(client, 'agent_providers')).toBe(false);
  });

  it('recovers every existing table when a newer migration caused the migration to be skipped', async () => {
    const { client, db } = await createDatabase(UPDATED_AT_COLUMNS_MIGRATION_TIMESTAMP + 1);
    await createTargetTables(client);

    const result = await fixupUpdatedAtColumns(db, 'target-hash');

    expect(result.action).toBe('schema_completed');
    expect(result.addedColumns).toHaveLength(7);
    for (const table of [
      'agent_providers',
      'agent_execution_contracts',
      'agent_execution_steps',
      'agent_notifications',
      'company_cash_ledger',
      'role_tool_permissions',
      'role_workflow_permissions',
    ]) {
      expect(await hasUpdatedAt(client, table)).toBe(true);
    }
    const indexes = await client.execute(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name IN (
        'agent_execution_contracts_updated_at_idx',
        'company_cash_ledger_updated_at_idx'
      )
    `);
    expect(indexes.rows).toHaveLength(2);
  });

  it('completes a partially applied migration without duplicating existing columns', async () => {
    const { client, db } = await createDatabase();
    await createTargetTables(client);
    await client.execute(
      'ALTER TABLE agent_providers ADD COLUMN updated_at integer NOT NULL DEFAULT 0',
    );

    const result = await fixupUpdatedAtColumns(db, 'target-hash');

    expect(result.addedColumns).toHaveLength(6);
    expect(result.addedColumns).not.toContain('agent_providers.updated_at');
    expect(result.insertedJournalEntry).toBe(true);
  });

  it('only repairs tables that exist in this installation', async () => {
    const { client, db } = await createDatabase(UPDATED_AT_COLUMNS_MIGRATION_TIMESTAMP + 1);
    await client.execute('CREATE TABLE agent_providers (id text PRIMARY KEY)');

    const result = await fixupUpdatedAtColumns(db, 'target-hash');

    expect(result.addedColumns).toEqual(['agent_providers.updated_at']);
  });

  it('is idempotent after the schema and journal are reconciled', async () => {
    const { client, db } = await createDatabase(UPDATED_AT_COLUMNS_MIGRATION_TIMESTAMP + 1);
    await createTargetTables(client);

    await fixupUpdatedAtColumns(db, 'target-hash');
    const result = await fixupUpdatedAtColumns(db, 'target-hash');

    expect(result).toEqual({
      action: 'already_applied',
      addedColumns: [],
      insertedJournalEntry: false,
    });
  });
});
