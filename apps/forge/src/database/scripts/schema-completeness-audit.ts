/**
 * Schema Completeness Audit Script (D50 #6332 cycle 17)
 *
 * L#NN-46 v4.8 schema-completeness: verifies that schema tables (TS drizzle
 * definitions) match drizzle snapshots (migrations/meta/*_snapshot.json) and
 * CREATE TABLE statements in SQL migration files.
 *
 * Per L#NN-22 v18 audit methodology: audit detects drift but does NOT mutate
 * state. Run: npx tsx apps/forge/src/database/scripts/schema-completeness-audit.ts
 *
 * Findings (D50):
 *   - 37 canonical tables (33 in apps/forge/src/database + 4 in apps/forge/src/finance/payment-schema.ts)
 *   - 33 tables in latest snapshot (0029_snapshot.json is the latest)
 *   - DRIFT: 4 payment tables (payment_customers, payment_providers,
 *     payment_subscriptions, payment_transactions) are in schema but NOT in
 *     the latest snapshot. drizzle-kit generate would emit duplicate CREATE
 *     TABLE migrations on the next run.
 *   - 8 migrations (0030-0037) lack snapshot files — drizzle-kit was not
 *     re-run after the payments P0 (#6301/#6315) fix in D30.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const DATABASE_DIR = 'apps/forge/src/database';
const PAYMENT_SCHEMA = 'apps/forge/src/finance/payment-schema.ts';
const MIGRATIONS_DIR = 'apps/forge/migrations';
const META_DIR = `${MIGRATIONS_DIR}/meta`;

function extractSchemaTables(): string[] {
  const files: string[] = fs
    .readdirSync(DATABASE_DIR)
    .filter((f) => f.startsWith('schema-') && f.endsWith('.ts') && !f.includes('relations'))
    .map((f) => path.join(DATABASE_DIR, f));
  if (fs.existsSync(PAYMENT_SCHEMA)) files.push(PAYMENT_SCHEMA);
  const tables = new Set<string>();
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    // Match sqliteTable('table_name', ...) with multi-line support
    const matches = content.matchAll(/sqliteTable\s*\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g);
    for (const m of matches) tables.add(m[1]);
  }
  return [...tables].sort();
}

function extractSnapshotTables(): { latest: string; tables: string[] } {
  const snapshots = fs
    .readdirSync(META_DIR)
    .filter((f) => f.endsWith('_snapshot.json'))
    .map((f) => path.join(META_DIR, f))
    .sort();
  const latest = snapshots[snapshots.length - 1]!;
  const j = JSON.parse(fs.readFileSync(latest, 'utf8')) as { tables?: Record<string, unknown> };
  return { latest, tables: Object.keys(j.tables ?? {}).sort() };
}

function extractMigrationCreateTables(): string[] {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => path.join(MIGRATIONS_DIR, f));
  const tables = new Set<string>();
  const skip = new Set(['and', 'for', 'if', 'is', 'time', 'statement', 'migration', 'migrations']);
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const m = line.match(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"']?([a-z_][a-z0-9_]*)[`"']?/i);
      if (m && m[1] && !skip.has(m[1])) tables.add(m[1]);
    }
  }
  return [...tables].sort();
}

function findMigrationsWithoutSnapshots(): string[] {
  const sqlFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('_'));
  const snapshots = fs
    .readdirSync(META_DIR)
    .filter((f) => f.endsWith('_snapshot.json'))
    .map((f) => f.replace('_snapshot.json', ''));
  const snapshotSet = new Set(snapshots);
  // Each SQL file: 0000_broken_natasha_romanoff.sql → prefix 0000
  return sqlFiles
    .map((f) => ({ file: f, prefix: f.split('_')[0]! }))
    .filter(({ prefix }) => !snapshotSet.has(prefix))
    .map(({ file }) => file);
}

function main(): void {
  const schema = extractSchemaTables();
  const { latest: latestSnapshot, tables: snapshot } = extractSnapshotTables();
  const migrations = extractMigrationCreateTables();
  const noSnapshot = findMigrationsWithoutSnapshots();

  const schemaSet = new Set(schema);
  const snapshotSet = new Set(snapshot);
  const migrationSet = new Set(migrations);

  const inSchemaNotSnapshot = schema.filter((t) => !snapshotSet.has(t));
  const inSnapshotNotSchema = snapshot.filter((t) => !schemaSet.has(t));
  const inMigrationsNotSchema = migrations.filter((t) => !schemaSet.has(t));

  console.log('=== Schema Completeness Audit (D50 #6332) ===');
  console.log(`Canonical tables (TS): ${schema.length}`);
  console.log(`Snapshot tables: ${snapshot.length}`);
  console.log(`Migration CREATE TABLEs: ${migrations.length}`);
  console.log(`Latest snapshot: ${latestSnapshot}`);
  console.log(`Migrations without snapshot: ${noSnapshot.length}`);
  for (const f of noSnapshot) console.log(`  - ${f}`);
  console.log('');
  console.log(`Schema → Snapshot drift (${inSchemaNotSnapshot.length}):`);
  for (const t of inSchemaNotSnapshot) console.log(`  + ${t}`);
  console.log(`Snapshot → Schema drift (${inSnapshotNotSchema.length}):`);
  for (const t of inSnapshotNotSchema) console.log(`  + ${t}`);
  console.log(`Migration → Schema drift (legacy CREATE TABLE) (${inMigrationsNotSchema.length}):`);
  for (const t of inMigrationsNotSchema) console.log(`  + ${t}`);

  if (inSchemaNotSnapshot.length > 0) {
    console.log('');
    console.log('⚠️  ACTION REQUIRED: re-run drizzle-kit generate to update snapshots for the drift above.');
    process.exit(1);
  }
}

main();
