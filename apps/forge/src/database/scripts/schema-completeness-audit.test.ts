/**
 * Schema Completeness Audit tests (D50 #6332 cycle 17)
 *
 * Validates the audit script's core extractors. The full integration
 * test (running the actual script) is the audit itself; these unit
 * tests verify the regex/parsing logic.
 */

import { describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = process.cwd();

describe('schema-completeness-audit (D50 #6332)', () => {
  test('extracts schema table names from TS files', () => {
    const files = fs
      .readdirSync(path.join(REPO_ROOT, 'apps/forge/src/database'))
      .filter((f) => f.startsWith('schema-') && f.endsWith('.ts') && !f.includes('relations'))
      .map((f) => path.join(REPO_ROOT, 'apps/forge/src/database', f));
    const tables = new Set<string>();
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      const matches = content.matchAll(/sqliteTable\s*\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g);
      for (const m of matches) tables.add(m[1]);
    }
    expect(tables.size).toBeGreaterThanOrEqual(33);
    expect(tables.has('agents')).toBe(true);
    expect(tables.has('forge_internal_chat_accounts')).toBe(true);
    expect(tables.has('forge_tickets')).toBe(true);
  });

  test('extracts payment tables from payment-schema.ts', () => {
    const f = path.join(REPO_ROOT, 'apps/forge/src/finance/payment-schema.ts');
    expect(fs.existsSync(f)).toBe(true);
    const content = fs.readFileSync(f, 'utf8');
    const matches = content.matchAll(/sqliteTable\s*\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g);
    const tables = [...matches].map((m) => m[1]);
    expect(tables).toContain('payment_customers');
    expect(tables).toContain('payment_providers');
    expect(tables).toContain('payment_subscriptions');
    expect(tables).toContain('payment_transactions');
  });

  test('latest snapshot is 0029_snapshot.json with 33 tables', () => {
    const meta = path.join(REPO_ROOT, 'apps/forge/migrations/meta');
    const snapshots = fs
      .readdirSync(meta)
      .filter((f) => f.endsWith('_snapshot.json'))
      .sort();
    const latest = snapshots[snapshots.length - 1]!;
    expect(latest).toBe('0029_snapshot.json');
    const j = JSON.parse(fs.readFileSync(path.join(meta, latest), 'utf8')) as {
      tables?: Record<string, unknown>;
    };
    expect(Object.keys(j.tables ?? {}).length).toBe(33);
  });

  test('schema-snapshot drift = 4 payment tables (KNOWN D50 finding)', () => {
    const schemaFiles = fs
      .readdirSync(path.join(REPO_ROOT, 'apps/forge/src/database'))
      .filter((f) => f.startsWith('schema-') && f.endsWith('.ts') && !f.includes('relations'))
      .map((f) => path.join(REPO_ROOT, 'apps/forge/src/database', f));
    const paymentSchema = path.join(REPO_ROOT, 'apps/forge/src/finance/payment-schema.ts');
    if (fs.existsSync(paymentSchema)) schemaFiles.push(paymentSchema);
    const schemaTables = new Set<string>();
    for (const f of schemaFiles) {
      const content = fs.readFileSync(f, 'utf8');
      const matches = content.matchAll(/sqliteTable\s*\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g);
      for (const m of matches) schemaTables.add(m[1]);
    }
    const latest = '0029_snapshot.json';
    const meta = path.join(REPO_ROOT, 'apps/forge/migrations/meta');
    const j = JSON.parse(fs.readFileSync(path.join(meta, latest), 'utf8')) as {
      tables?: Record<string, unknown>;
    };
    const snapshotTables = new Set(Object.keys(j.tables ?? {}));
    const drift = [...schemaTables].filter((t) => !snapshotTables.has(t));
    // The 4 payment tables are the known drift from D30 (#6301/#6315 fix).
    expect(drift.sort()).toEqual([
      'payment_customers',
      'payment_providers',
      'payment_subscriptions',
      'payment_transactions',
    ]);
  });

  test('migrations 0030-0036 are missing snapshot files (KNOWN D50 finding)', () => {
    const sqlFiles = fs
      .readdirSync(path.join(REPO_ROOT, 'apps/forge/migrations'))
      .filter((f) => f.endsWith('.sql') && !f.startsWith('_'));
    const snapshots = fs
      .readdirSync(path.join(REPO_ROOT, 'apps/forge/migrations/meta'))
      .filter((f) => f.endsWith('_snapshot.json'))
      .map((f) => f.replace('_snapshot.json', ''));
    const snapshotSet = new Set(snapshots);
    const missing = sqlFiles
      .map((f) => ({ file: f, prefix: f.split('_')[0]! }))
      .filter(({ prefix }) => !snapshotSet.has(prefix))
      .map(({ file }) => file);
    // Expect 7 migrations without snapshots (the 4 payment ones are the root cause)
    expect(missing.length).toBe(7);
    expect(missing).toContain('0035_create_payment_tables.sql');
    expect(missing).toContain('0036_create_payment_tables.sql');
  });
});
