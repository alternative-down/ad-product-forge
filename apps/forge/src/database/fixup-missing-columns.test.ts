/**
 * Tests for fixup-missing-columns (D56 11:36Z, #6722)
 *
 * L#NN-32 v17: pure functions, isolated tests.
 * L#NN-22 v18a: per-test tmp DB, no shared state.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import { sql } from 'drizzle-orm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fixupMissingColumns } from './fixup-missing-columns';
import * as schema from './schema';

let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
let tmpDir: string;
let dbPath: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-fixup-test-'));
  dbPath = path.join(tmpDir, 'test.db');
  client = createClient({ url: `file:${dbPath}` });
  db = drizzle(client, { schema });

  // Create the system_settings table WITHOUT created_at column (mimics prod state)
  await db.run(sql`CREATE TABLE system_settings (
    id text PRIMARY KEY,
    company_name text NOT NULL,
    company_context text NOT NULL,
    updated_at integer NOT NULL
  )`);

  // Create the __drizzle_migrations bookkeeping table
  await db.run(sql`CREATE TABLE __drizzle_migrations (
    id integer PRIMARY KEY AUTOINCREMENT,
    hash text NOT NULL,
    created_at integer NOT NULL
  )`);
});

afterEach(() => {
  client.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('fixupMissingColumns', () => {
  it('adds column when missing and journal empty (prod state)', async () => {
    // Sanity: column doesn't exist, journal empty
    const colsBefore = await db.all<{ name: string }>(sql`PRAGMA table_info(system_settings)`);
    expect(colsBefore.find((c) => c.name === 'created_at')).toBeUndefined();

    const result = await fixupMissingColumns(db);
    expect(result.ranFixup).toBe(true);
    expect(result.reason).toBe('column_added_and_journal_synced');

    // Verify column added
    const colsAfter = await db.all<{ name: string }>(sql`PRAGMA table_info(system_settings)`);
    expect(colsAfter.find((c) => c.name === 'created_at')).toBeDefined();

    // Verify journal synced
    const journal = await db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`);
    expect(journal).toHaveLength(1);
    expect(journal[0]?.hash).toBe('66ab776775372a9034465edf2720f560ebfb8343');
  });

  it('no-ops when column present AND journal synced (healthy state)', async () => {
    // Set up healthy state: column + journal
    await db.run(sql`ALTER TABLE system_settings ADD COLUMN created_at integer NOT NULL DEFAULT 0`);
    await db.run(sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES('66ab776775372a9034465edf2720f560ebfb8343', 1775481600000)`);

    const result = await fixupMissingColumns(db);
    expect(result.ranFixup).toBe(false);
    expect(result.reason).toBe('column_present');
  });

  it('syncs journal when column present but journal missing', async () => {
    await db.run(sql`ALTER TABLE system_settings ADD COLUMN created_at integer NOT NULL DEFAULT 0`);

    const result = await fixupMissingColumns(db);
    expect(result.ranFixup).toBe(true);
    expect(result.reason).toBe('journal_already_synced');

    const journal = await db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`);
    expect(journal).toHaveLength(1);
  });

  it('adds column when missing but journal already has entry (anomalous)', async () => {
    await db.run(sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES('66ab776775372a9034465edf2720f560ebfb8343', 1775481600000)`);

    const result = await fixupMissingColumns(db);
    expect(result.ranFixup).toBe(true);
    expect(result.reason).toBe('column_added');

    const cols = await db.all<{ name: string }>(sql`PRAGMA table_info(system_settings)`);
    expect(cols.find((c) => c.name === 'created_at')).toBeDefined();

    // Journal should still have only 1 entry (no duplicate)
    const journal = await db.all<{ id: number }>(sql`SELECT id FROM __drizzle_migrations`);
    expect(journal).toHaveLength(1);
  });

  it('is idempotent: re-running after full fixup is a no-op', async () => {
    // First run: full fixup
    const first = await fixupMissingColumns(db);
    expect(first.ranFixup).toBe(true);
    expect(first.reason).toBe('column_added_and_journal_synced');

    // Second run: no-op
    const second = await fixupMissingColumns(db);
    expect(second.ranFixup).toBe(false);
    expect(second.reason).toBe('column_present');

    // Journal still has 1 entry (no duplicates)
    const journal = await db.all<{ id: number }>(sql`SELECT id FROM __drizzle_migrations`);
    expect(journal).toHaveLength(1);
  });
});
