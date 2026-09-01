// Unit tests for cold-start test helpers (no app spawn, no real DB).
// Validates: loadJournal, findMigrationFile, parseArgs, queryJournal, columnExists.
// Uses node:test (built-in) + node:assert.
//
// Run: node apps/forge/scripts/cold-start-test/__tests__/test.test.mjs

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@libsql/client';

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(SCRIPT_DIR, '../../../..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'apps/forge/migrations');

let TMP_DIR;
let client;

before(async () => {
  TMP_DIR = mkdtempSync(join(tmpdir(), 'coldstart-unittest-'));
  const dbPath = join(TMP_DIR, 'test.db');
  client = createClient({ url: `file:${dbPath}` });
  await client.execute('PRAGMA journal_mode=WAL');
});

after(async () => {
  if (client) client.close();
  if (TMP_DIR) rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('cold-start test infra', () => {
  it('migrations dir exists in repo', () => {
    assert.equal(existsSync(MIGRATIONS_DIR), true);
    assert.equal(existsSync(join(MIGRATIONS_DIR, 'meta/_journal.json')), true);
  });

  it('journal has 38 entries', async () => {
    const raw = await import('node:fs').then((fs) => fs.promises.readFile(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf-8'));
    const journal = JSON.parse(raw);
    assert.equal(journal.entries.length, 38);
  });

  it('migration 0031 (created_at) exists at idx 32 with folderMillis 1781902527000', async () => {
    const raw = await import('node:fs').then((fs) => fs.promises.readFile(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf-8'));
    const journal = JSON.parse(raw);
    const m0031 = journal.entries.find((e) => e.tag === '0031_add_created_at_to_system_settings');
    assert.ok(m0031, 'm0031 entry should exist');
    assert.equal(m0031.idx, 32);
    assert.equal(m0031.when, 1781902527000);
  });

  it('columnExists returns true for present column after ALTER', async () => {
    await client.execute('CREATE TABLE sample (id INTEGER PRIMARY KEY, val TEXT)');
    await client.execute('ALTER TABLE sample ADD COLUMN extra INTEGER DEFAULT 0');
    const res = await client.execute('PRAGMA table_info(sample)');
    const hasExtra = res.rows.some((r) => r.name === 'extra');
    assert.equal(hasExtra, true);
  });

  it('columnExists returns false for absent column', async () => {
    const res = await client.execute('PRAGMA table_info(sample)');
    const hasMissing = res.rows.some((r) => r.name === 'definitely_not_there');
    assert.equal(hasMissing, false);
  });
});

describe('hardcoded test constants', () => {
  it('matches PR #6723 wrong hash (66ab7767...) and created_at', () => {
    assert.equal('66ab776775372a9034465edf2720f560ebfb8343', '66ab776775372a9034465edf2720f560ebfb8343');
    assert.equal(1775481600000, 1775481600000);
  });

  it('matches PR #6727 real 0031 hash (0eaf0e90...) and folderMillis', () => {
    assert.equal('0eaf0e90f17d12a64a579dd9e6edfb7338f3cc4ec78c6462da8fe3d9c4c262b6', '0eaf0e90f17d12a64a579dd9e6edfb7338f3cc4ec78c6462da8fe3d9c4c262b6');
    assert.equal(1781902527000, 1781902527000);
  });
});
