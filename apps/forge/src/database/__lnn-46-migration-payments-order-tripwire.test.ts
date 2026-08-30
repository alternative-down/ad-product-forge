/**
 * L#NN-46 v4.8 migration-order tripwire (Day 39 #6315)
 *
 * Asserts: 0035_create_payment_tables MUST run BEFORE 0032_payment_receivables_currency_unique
 * in the journal order. This guarantees that 0032's ALTER TABLE payment_subscriptions
 * does not fail with "no such table: payment_subscriptions".
 *
 * Background: PR #6303 (cycle 14 P0) added migration 0036 to create the 4 payment
 * tables. However, 0032 (ALTER TABLE payment_subscriptions ADD COLUMN currency)
 * was added BEFORE 0036 in the journal. When 0032 runs first, it fails because
 * payment_subscriptions doesn't exist yet.
 *
 * Drizzle's `readMigrationFiles` iterates journal.entries in order (does NOT sort
 * by `when`). Therefore the only fix is to insert 0035 (CREATE TABLE statements
 * only) BEFORE 0032 in the journal.
 *
 * Tripwire checks:
 * 1. Migration 0035 file exists (not just in journal)
 * 2. Migration 0035 appears at idx < 0032 in the journal
 * 3. Migration 0035's `when` > 0027_encrypt_webhook_secrets (otherwise it would
 *    be skipped due to `lastDbMigration.createdAt >= migration.folderMillis`)
 */

import { describe, expect, it } from 'vitest';
import { } from '../tripwire-helpers'; // D61: tripwire-helpers adoption (L#NN-32 v8 meta-tripwire)
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

describe('L#NN-46 v4.8 migration-order (Day 39 #6315)', () => {
  const journalPath = join(MIGRATIONS_DIR, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));

  it('migration 0035 file exists', () => {
    const filePath = join(MIGRATIONS_DIR, '0035_create_payment_tables.sql');
    expect(existsSync(filePath)).toBe(true);
  });

  it('migration 0035 is registered in the journal', () => {
    const entry = journal.entries.find((e: { tag: string }) => e.tag === '0035_create_payment_tables');
    expect(entry).toBeDefined();
  });

  it('migration 0035 idx is LESS THAN 0032 idx (runs first)', () => {
    const entry0035 = journal.entries.find((e: { tag: string }) => e.tag === '0035_create_payment_tables');
    const entry0032 = journal.entries.find(
      (e: { tag: string }) => e.tag === '0032_payment_receivables_currency_unique',
    );
    expect(entry0035).toBeDefined();
    expect(entry0032).toBeDefined();
    expect(entry0035.idx).toBeLessThan(entry0032.idx);
  });

  it('migration 0035 when is AFTER 0027_encrypt_webhook_secrets (avoid skip)', () => {
    const entry0035 = journal.entries.find((e: { tag: string }) => e.tag === '0035_create_payment_tables');
    const entry0027 = journal.entries.find(
      (e: { tag: string }) => e.tag === '0027_encrypt_webhook_secrets',
    );
    expect(entry0035).toBeDefined();
    expect(entry0027).toBeDefined();
    expect(entry0035.when).toBeGreaterThan(entry0027.when);
  });

  it('migration 0035 when is BEFORE 0032 when (consistent with execution order)', () => {
    const entry0035 = journal.entries.find((e: { tag: string }) => e.tag === '0035_create_payment_tables');
    const entry0032 = journal.entries.find(
      (e: { tag: string }) => e.tag === '0032_payment_receivables_currency_unique',
    );
    expect(entry0035.when).toBeLessThan(entry0032.when);
  });

  it('migration 0035 contains CREATE TABLE for payment_subscriptions', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0035_create_payment_tables.sql'), 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS.*payment_subscriptions/i);
  });

  it('migration 0035 does NOT include currency column (0032 adds it)', () => {
    const raw = readFileSync(join(MIGRATIONS_DIR, '0035_create_payment_tables.sql'), 'utf8');
    // Strip line comments first so the regex doesn't match the docstring
    const sql = raw.replace(/--[^\n]*/g, '');
    const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS[\s\S]*?payment_subscriptions[\s\S]*?\);/i);
    expect(createMatch).toBeDefined();
    expect(createMatch?.[0]).not.toMatch(/currency/i);
  });

  it('migration 0035 does NOT include currency column on payment_transactions', () => {
    const raw = readFileSync(join(MIGRATIONS_DIR, '0035_create_payment_tables.sql'), 'utf8');
    const sql = raw.replace(/--[^\n]*/g, '');
    const createMatch = sql.match(/CREATE TABLE IF NOT EXISTS[\s\S]*?payment_transactions[\s\S]*?\);/i);
    expect(createMatch).toBeDefined();
    expect(createMatch?.[0]).not.toMatch(/currency/i);
  });

  it('migration 0035 omits REFERENCES clauses (PRAGMA foreign_keys off at CREATE)', () => {
    const raw = readFileSync(join(MIGRATIONS_DIR, '0035_create_payment_tables.sql'), 'utf8');
    const sql = raw.replace(/--[^\n]*/g, '');
    expect(sql).not.toMatch(/REFERENCES\s+`?payment_/i);
  });
});
