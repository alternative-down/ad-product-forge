/**
 * Test coverage for fixupSystemSettingsCreatedAt (D56 Sprint 0).
 *
 * L#NN-22 v18a: per-test tmp DB via env override, no shared state.
 * L#NN-19 v1.2 hygiene: no env values echoed in test output.
 *
 * 5 reachable states per the spec:
 * 1. already_clean: column exists + real hash in journal + no wrong hash
 * 2. wrong_hash_removed_and_journal_synced: column exists + wrong hash + no real hash
 * 3. wrong_hash_removed_and_column_added: column missing + wrong hash
 * 4. journal_synced: column exists + no real hash + no wrong hash
 * 5. column_added_and_journal_synced: column missing + nothing
 */

import { describe, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { fixupSystemSettingsCreatedAt } from './fixup-system-settings';

const MIGRATIONS_DIR = `${process.cwd()}/migrations`;
const MIGRATION_0031_FILE = `${MIGRATIONS_DIR}/0031_add_created_at_to_system_settings.sql`;
const REAL_HASH_0031 = createHash('sha256').update(readFileSync(MIGRATION_0031_FILE, 'utf-8')).digest('hex');

// ─── test helpers ────────────────────────────────────────────────────────────

interface MockDbState {
  columnExists: boolean;
  realHashInJournal: boolean;
  wrongHashInJournal: boolean;
}

function chunkValueToString(chunk: unknown): string {
  if (chunk && typeof chunk === 'object' && 'value' in chunk) {
    const v = (chunk as { value: unknown }).value;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map((p) => typeof p === 'string' ? p : sqlFragmentToString(p)).join('');
  }
  if (chunk && typeof chunk === 'object' && 'queryChunks' in chunk) {
    return sqlFragmentToString(chunk);
  }
  return '';
}

function sqlFragmentToString(sqlFragment: unknown): string {
  if (typeof sqlFragment === 'string') return sqlFragment.trim();
  const obj = sqlFragment as
    | { queryChunks?: Array<unknown> }
    | null
    | undefined;
  if (!obj || !Array.isArray(obj.queryChunks)) return String(sqlFragment);
  let out = '';
  for (const chunk of obj.queryChunks) {
    out += chunkValueToString(chunk);
  }
  return out.trim();
}

function createMockDb(state: MockDbState) {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const columnRows = state.columnExists
    ? [{ name: 'id' }, { name: 'created_at' }]
    : [{ name: 'id' }];
  const journalRows = [
    ...(state.realHashInJournal ? [{ hash: REAL_HASH_0031 }] : []),
    ...(state.wrongHashInJournal
      ? [{ hash: '66ab776775372a9034465edf2720f560ebfb8343' }]
      : []),
  ];
  return {
    all: vi.fn(async (sqlFragment: unknown) => {
      const sqlText = sqlFragmentToString(sqlFragment);
      if (sqlText.startsWith('PRAGMA table_info')) return columnRows;
      if (sqlText.startsWith('SELECT hash FROM __drizzle_migrations')) {
        return journalRows;
      }
      return [];
    }),
    run: vi.fn(async (sqlFragment: unknown) => {
      runs.push({ sql: sqlFragmentToString(sqlFragment), params: [] });
    }),
    _runs: runs,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('fixupSystemSettingsCreatedAt', () => {
  test('state 1: column exists + real hash present → already_clean', async () => {
    const mockDb = createMockDb({
      columnExists: true,
      realHashInJournal: true,
      wrongHashInJournal: false,
    });
    const result = await fixupSystemSettingsCreatedAt(mockDb as never, {
      migrationsFolder: MIGRATIONS_DIR,
      timestamp: 1795580000000,
    });
    expect(result.action).toBe('already_clean');
    expect(result.deletedWrongHash).toBe(false);
    expect(result.addedColumn).toBe(false);
    expect(result.insertedJournalEntry).toBe(false);
    expect(result.computedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('state 2: column exists + wrong hash + no real hash → wrong_hash_removed_and_journal_synced', async () => {
    const mockDb = createMockDb({
      columnExists: true,
      realHashInJournal: false,
      wrongHashInJournal: true,
    });
    const result = await fixupSystemSettingsCreatedAt(mockDb as never, {
      migrationsFolder: MIGRATIONS_DIR,
      timestamp: 1795580000000,
    });
    expect(result.action).toBe('wrong_hash_removed_and_journal_synced');
    expect(result.deletedWrongHash).toBe(true);
    expect(result.addedColumn).toBe(false);
    expect(result.insertedJournalEntry).toBe(true);
  });

  test('state 3: column missing + wrong hash → wrong_hash_removed_and_column_added', async () => {
    const mockDb = createMockDb({
      columnExists: false,
      realHashInJournal: false,
      wrongHashInJournal: true,
    });
    const result = await fixupSystemSettingsCreatedAt(mockDb as never, {
      migrationsFolder: MIGRATIONS_DIR,
      timestamp: 1795580000000,
    });
    expect(result.action).toBe('wrong_hash_removed_and_column_added');
    expect(result.deletedWrongHash).toBe(true);
    expect(result.addedColumn).toBe(true);
    expect(result.insertedJournalEntry).toBe(true);
  });

  test('state 4: column exists + no real hash + no wrong hash → journal_synced', async () => {
    const mockDb = createMockDb({
      columnExists: true,
      realHashInJournal: false,
      wrongHashInJournal: false,
    });
    const result = await fixupSystemSettingsCreatedAt(mockDb as never, {
      migrationsFolder: MIGRATIONS_DIR,
      timestamp: 1795580000000,
    });
    expect(result.action).toBe('journal_synced');
    expect(result.deletedWrongHash).toBe(false);
    expect(result.addedColumn).toBe(false);
    expect(result.insertedJournalEntry).toBe(true);
  });

  test('state 5: column missing + nothing → column_added_and_journal_synced', async () => {
    const mockDb = createMockDb({
      columnExists: false,
      realHashInJournal: false,
      wrongHashInJournal: false,
    });
    const result = await fixupSystemSettingsCreatedAt(mockDb as never, {
      migrationsFolder: MIGRATIONS_DIR,
      timestamp: 1795580000000,
    });
    expect(result.action).toBe('column_added_and_journal_synced');
    expect(result.deletedWrongHash).toBe(false);
    expect(result.addedColumn).toBe(true);
    expect(result.insertedJournalEntry).toBe(true);
  });

  test('idempotency: re-running after state 5 returns already_clean', async () => {
    // First call state 5: column missing + nothing
    const mockDbFirst = createMockDb({
      columnExists: false,
      realHashInJournal: false,
      wrongHashInJournal: false,
    });
    const first = await fixupSystemSettingsCreatedAt(mockDbFirst as never, {
      migrationsFolder: MIGRATIONS_DIR,
      timestamp: 1795580000000,
    });
    expect(first.action).toBe('column_added_and_journal_synced');

    // Simulate post-first-call DB state: column + real hash present
    const mockDbSecond = createMockDb({
      columnExists: true,
      realHashInJournal: true,
      wrongHashInJournal: false,
    });
    const second = await fixupSystemSettingsCreatedAt(mockDbSecond as never, {
      migrationsFolder: MIGRATIONS_DIR,
      timestamp: 1795580000001,
    });
    expect(second.action).toBe('already_clean');
  });
});
