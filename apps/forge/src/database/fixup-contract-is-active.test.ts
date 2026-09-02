import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CONTRACT_IS_ACTIVE_MIGRATION_TIMESTAMP,
  fixupContractIsActive,
} from './fixup-contract-is-active';

const clients: Client[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.close();
});

async function createDatabase(options: {
  table?: boolean;
  column?: boolean;
  latestMigration?: number;
} = {}) {
  const client = createClient({ url: ':memory:' });
  clients.push(client);
  await client.execute(`
    CREATE TABLE __drizzle_migrations (
      id INTEGER PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);
  if (options.table !== false) {
    await client.execute('CREATE TABLE agent_execution_contracts (id text PRIMARY KEY)');
  }
  if (options.column) {
    await client.execute(`
      ALTER TABLE agent_execution_contracts
      ADD COLUMN is_active integer NOT NULL DEFAULT 1
    `);
  }
  if (options.latestMigration !== undefined) {
    await client.execute({
      sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
      args: ['existing-hash', options.latestMigration],
    });
  }
  return { client, db: drizzle(client) as LibSQLDatabase<Record<string, unknown>> };
}

describe('fixupContractIsActive', () => {
  it('leaves a fresh installation for the normal migrator', async () => {
    const { client, db } = await createDatabase();

    const result = await fixupContractIsActive(db, 'target-hash');

    expect(result.action).toBe('not_started');
    const columns = await client.execute('PRAGMA table_info(agent_execution_contracts)');
    expect(columns.rows.some((row) => row.name === 'is_active')).toBe(false);
  });

  it('recovers a column skipped by an installation with a newer journal', async () => {
    const { client, db } = await createDatabase({
      latestMigration: CONTRACT_IS_ACTIVE_MIGRATION_TIMESTAMP + 1,
    });

    const result = await fixupContractIsActive(db, 'target-hash');

    expect(result).toEqual({ action: 'column_added', insertedJournalEntry: true });
    const columns = await client.execute('PRAGMA table_info(agent_execution_contracts)');
    expect(columns.rows.some((row) => row.name === 'is_active')).toBe(true);
    const indexes = await client.execute(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name = 'agent_execution_contracts_is_active_idx'
    `);
    expect(indexes.rows).toHaveLength(1);
  });

  it('synchronizes a partial migration where the column already exists', async () => {
    const { db } = await createDatabase({ column: true });

    const result = await fixupContractIsActive(db, 'target-hash');

    expect(result).toEqual({ action: 'journal_synchronized', insertedJournalEntry: true });
  });

  it('is idempotent after recovery', async () => {
    const { db } = await createDatabase({
      latestMigration: CONTRACT_IS_ACTIVE_MIGRATION_TIMESTAMP + 1,
    });

    await fixupContractIsActive(db, 'target-hash');
    const result = await fixupContractIsActive(db, 'target-hash');

    expect(result).toEqual({ action: 'already_applied', insertedJournalEntry: false });
  });
});
