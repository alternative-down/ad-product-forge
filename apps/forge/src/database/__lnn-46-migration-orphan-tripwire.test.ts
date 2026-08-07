/**
 * L#NN-46 v4.7 migration-orphan tripwire (Day 38 #6294 P0)
 *
 * Asserts: every `*.sql` migration file in apps/forge/migrations/ MUST have
 * a corresponding entry in apps/forge/migrations/meta/_journal.json.
 *
 * Background: #6294 P0 found that 4 migration commits (0031-0034) shipped
 * SQL files WITHOUT updating the Drizzle _journal.json:
 *
 *   - 0031_add_created_at_to_system_settings       (commit e4e9f5cb)
 *   - 0032_payment_receivables_currency_unique      (commit 639bcba6)
 *   - 0033_agent_schedules_creator_id_fk            (commit 77ee2b95)
 *   - 0034_company_cash_ledger_currency             (commit d7e156e6)
 *
 * Root cause: each author "forgot" to add the journal entry; CI tripwire
 * did not exist to catch this. L#NN-46 v4.6 codification (atomicity) was
 * PROMOTED but had no enforcement mechanism.
 *
 * L#NN-46 v4.7 STRENGTHENING: this tripwire fails the build if any SQL
 * migration file lacks a journal entry. Codification becomes enforceable.
 *
 * Tripwire scope: apps/forge/migrations/*.sql only.
 *
 * Note on idx monotonicity: Drizzle journal `idx` is the application order
 * (assigned sequentially as migrations are applied), and `when` is the
 * unix-ms timestamp when the journal entry was added (which can be
 * LATER than the migration file commit date — e.g., for orphan migrations
 * added retroactively). Strict monotonic ordering by `when` is NOT required.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');
const JOURNAL_PATH = join(MIGRATIONS_DIR, 'meta', '_journal.json');

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => basename(f, '.sql'))
    .sort();
}

function loadJournal(): Journal {
  return JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as Journal;
}

describe('L#NN-46 v4.7 migration-orphan tripwire (Day 38 #6294 P0)', () => {
  const journal = loadJournal();
  const journalTags = new Set(journal.entries.map((e) => e.tag));
  const sqlTags = listMigrationFiles();

  it('has migration SQL files to scan', () => {
    expect(sqlTags.length).toBeGreaterThan(0);
  });

  it('has journal entries', () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it('journal entry count matches migration file count', () => {
    expect(journal.entries.length).toBe(sqlTags.length);
  });

  it('every SQL migration file has a corresponding journal entry', () => {
    const orphans = sqlTags.filter((tag) => !journalTags.has(tag));
    expect(orphans).toEqual([]);
  });

  it('idx values are unique and start at 0', () => {
    const idxs = journal.entries.map((e) => e.idx);
    const unique = new Set(idxs);
    expect(unique.size).toBe(idxs.length);
    expect(Math.min(...idxs)).toBe(0);
  });

  it('idx values are sequential (no gaps)', () => {
    const idxs = journal.entries.map((e) => e.idx).sort((a, b) => a - b);
    for (let i = 0; i < idxs.length; i++) {
      expect(idxs[i]).toBe(i);
    }
  });

  it('every journal entry references an existing SQL migration file', () => {
    const orphans = journal.entries
      .filter((e) => !sqlTags.includes(e.tag))
      .map((e) => e.tag);
    expect(orphans).toEqual([]);
  });

  it('no duplicate tags in journal', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of journal.entries) {
      if (seen.has(entry.tag)) duplicates.push(entry.tag);
      seen.add(entry.tag);
    }
    expect(duplicates).toEqual([]);
  });

  it('every when timestamp is a positive integer (milliseconds)', () => {
    for (const entry of journal.entries) {
      expect(Number.isInteger(entry.when)).toBe(true);
      expect(entry.when).toBeGreaterThan(0);
    }
  });
});
