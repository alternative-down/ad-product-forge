import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, describe, expect, it } from 'vitest';

import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import {
  fixupWebhookSecretColumns,
  WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP,
} from './fixup-webhook-secret-columns';

const clients: Client[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.close();
});

async function createDatabase(options: {
  table?: boolean;
  encryptedColumn?: boolean;
  lastFourColumn?: boolean;
  journal?: boolean;
  laterJournal?: boolean;
} = {}): Promise<LibSQLDatabase<Record<string, unknown>>> {
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
    await client.execute('CREATE TABLE webhook_routes (route_id text PRIMARY KEY)');
  }
  if (options.encryptedColumn) {
    await client.execute('ALTER TABLE webhook_routes ADD COLUMN secret_encrypted text');
  }
  if (options.lastFourColumn) {
    await client.execute('ALTER TABLE webhook_routes ADD COLUMN secret_last_four text');
  }
  if (options.journal) {
    await client.execute({
      sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
      args: ['migration-hash', WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP],
    });
  }
  if (options.laterJournal) {
    await client.execute({
      sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
      args: ['later-migration', WEBHOOK_SECRET_COLUMNS_MIGRATION_TIMESTAMP + 1],
    });
  }

  return drizzle(client);
}

async function columnNames(db: LibSQLDatabase<Record<string, unknown>>): Promise<string[]> {
  const rows = await db.all<{ name: string }>('PRAGMA table_info(webhook_routes)');
  return rows.map((row) => row.name);
}

describe('fixupWebhookSecretColumns', () => {
  it('leaves an installation that has not started migration 0027 unchanged', async () => {
    const db = await createDatabase();

    const result = await fixupWebhookSecretColumns(db, 'migration-hash');

    expect(result.action).toBe('not_started');
    expect(await columnNames(db)).toEqual(['route_id']);
  });

  it('does not interfere before the webhook table has been created', async () => {
    const db = await createDatabase({ table: false });

    const result = await fixupWebhookSecretColumns(db, 'migration-hash');

    expect(result.action).toBe('table_missing');
  });

  it('recovers webhook tables skipped by an installation with a newer journal', async () => {
    const db = await createDatabase({ table: false, laterJournal: true });

    const result = await fixupWebhookSecretColumns(db, 'migration-hash');

    expect(result).toEqual({
      action: 'tables_recovered',
      addedColumns: ['secret_encrypted', 'secret_last_four'],
      insertedJournalEntry: true,
    });
    expect(await columnNames(db)).toEqual([
      'route_id',
      'agent_id',
      'name',
      'secret',
      'secret_encrypted',
      'secret_last_four',
      'is_active',
      'created_at',
      'updated_at',
    ]);
    const eventTables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'webhook_events'",
    );
    expect(eventTables).toHaveLength(1);
  });

  it('completes a partially applied migration and synchronizes its journal', async () => {
    const db = await createDatabase({ encryptedColumn: true });

    const result = await fixupWebhookSecretColumns(db, 'migration-hash');

    expect(result).toMatchObject({
      action: 'columns_completed',
      addedColumns: ['secret_last_four'],
      insertedJournalEntry: true,
    });
    expect(await columnNames(db)).toEqual([
      'route_id',
      'secret_encrypted',
      'secret_last_four',
    ]);
  });

  it('synchronizes the journal when both columns already exist', async () => {
    const db = await createDatabase({ encryptedColumn: true, lastFourColumn: true });

    const result = await fixupWebhookSecretColumns(db, 'migration-hash');

    expect(result.action).toBe('journal_synchronized');
    expect(result.insertedJournalEntry).toBe(true);
  });

  it('is a no-op for an installation where migration 0027 is complete', async () => {
    const db = await createDatabase({
      encryptedColumn: true,
      lastFourColumn: true,
      journal: true,
    });

    const first = await fixupWebhookSecretColumns(db, 'migration-hash');
    const second = await fixupWebhookSecretColumns(db, 'migration-hash');

    expect(first.action).toBe('already_applied');
    expect(second.action).toBe('already_applied');
  });

  it('repairs missing columns when the journal incorrectly says migration 0027 completed', async () => {
    const db = await createDatabase({ journal: true });

    const result = await fixupWebhookSecretColumns(db, 'migration-hash');

    expect(result.addedColumns).toEqual(['secret_encrypted', 'secret_last_four']);
    expect(result.insertedJournalEntry).toBe(false);
  });
});
