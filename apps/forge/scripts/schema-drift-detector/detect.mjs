#!/usr/bin/env node
// Schema-vs-migration drift detector
// Usage: node apps/forge/scripts/schema-drift-detector/detect.mjs [REPO_ROOT] [--no-fail]
// Default REPO_ROOT: current working directory
// Default exit: 0 = no NEW drift, 1 = new drift found
// --no-fail: always exit 0 (use for informational CI steps; the report still prints)
//
// Processes DDL operations in this order: CREATE → DROP → RENAME → ADD COLUMN
// This is critical for SQLite's __new_X → RENAME TO Y migration pattern.
// In 0010_mushy_hex.sql:
//   1. CREATE __new_agents
//   2. INSERT INTO __new_agents (no DDL)
//   3. DROP agents
//   4. ALTER __new_agents RENAME TO agents
// DROP must run before RENAME so the just-renamed agents isn't deleted.
//
// Baseline file: known-drift.json (alongside this script)
//   - Lists drift that's been audited and accepted
//   - CI fails only on drift NOT in the baseline
//   - Update the baseline when new drift is intentionally accepted

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);
const NO_FAIL = args.includes('--no-fail');
const positionalArgs = args.filter(a => !a.startsWith('--'));
const repoRootArg = positionalArgs[0] || process.cwd();
const REPO_ROOT = resolve(repoRootArg);
const MIGRATIONS_DIR = join(REPO_ROOT, 'apps/forge/migrations');
const SCHEMA_DIR = join(REPO_ROOT, 'apps/forge/src/database');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASELINE_FILE = join(__dirname, 'known-drift.json');

if (!existsSync(MIGRATIONS_DIR)) {
  console.error(`❌ Migrations dir not found: ${MIGRATIONS_DIR}`);
  console.error(`   Pass REPO_ROOT as argument: node detect.mjs /path/to/ad-product-forge`);
  process.exit(2);
}

if (!existsSync(SCHEMA_DIR)) {
  console.error(`❌ Schema dir not found: ${SCHEMA_DIR}`);
  process.exit(2);
}

function loadBaseline() {
  if (!existsSync(BASELINE_FILE)) {
    return { version: 0, entries: [] };
  }
  try {
    const content = readFileSync(BASELINE_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`❌ Failed to parse baseline file: ${BASELINE_FILE}`);
    console.error(`   ${err.message}`);
    process.exit(2);
  }
}

function buildId(type, table, column) {
  // Human-readable ID for the baseline entry.
  // Examples:
  //   "schema-table-forge_tickets"
  //   "schema-column-agent_execution_contracts.is_active"
  if (column) {
    // type already includes "-column" or "-table"; do not double it
    return `${type}-${table}.${column}`;
  }
  return `${type}-${table}`;
}

function isInBaseline(baseline, type, table, column) {
  const id = buildId(type, table, column);
  return baseline.entries.some(e => e.id === id);
}

function extractColumns(cols) {
  const colRe = /`(\w+)`\s+\w+/g;
  const result = new Set();
  let m;
  while ((m = colRe.exec(cols)) !== null) {
    result.add(m[1]);
  }
  return result;
}

function parseMigrations() {
  // Build a stream of operations in order from each migration file.
  // The order of processing within a single migration matters!
  const tables = {};
  const files = readdirSync(MIGRATIONS_DIR).filter(f => /^00\d\d_.*\.sql$/.test(f)).sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const fileShort = file.replace(/^00\d\d_/, '');

    // Phase 1: CREATE TABLE (regex with global flag)
    const tableRe = /CREATE TABLE (?:IF NOT EXISTS )?`(\w+)` \(([^;]+)\);/g;
    let m;
    while ((m = tableRe.exec(sql)) !== null) {
      const name = m[1];
      const cols = extractColumns(m[2]);
      tables[name] = { columns: cols, file: fileShort };
    }

    // Phase 2: DROP TABLE — must come BEFORE RENAME to avoid deleting just-renamed tables
    const dropRe = /DROP TABLE `(\w+)`/g;
    while ((m = dropRe.exec(sql)) !== null) {
      delete tables[m[1]];
    }

    // Phase 3: RENAME — moves __new_X to its final name
    const renameRe = /ALTER TABLE `(\w+)` RENAME TO `(\w+)`/g;
    while ((m = renameRe.exec(sql)) !== null) {
      const oldName = m[1];
      const newName = m[2];
      if (tables[oldName]) {
        tables[newName] = { ...tables[oldName] };
        delete tables[oldName];
      }
    }

    // Phase 4: ADD COLUMN — modifies existing tables
    const alterRe = /ALTER TABLE `(\w+)` ADD COLUMN `(\w+)`/g;
    while ((m = alterRe.exec(sql)) !== null) {
      const tableName = m[1];
      const colName = m[2];
      if (tables[tableName]) {
        tables[tableName].columns.add(colName);
      }
    }
  }
  return tables;
}

function parseSchemas() {
  const tables = {};
  const files = readdirSync(SCHEMA_DIR).filter(f => f.startsWith('schema-') && f.endsWith('.ts') && !f.includes('relations'));

  for (const file of files) {
    const content = readFileSync(join(SCHEMA_DIR, file), 'utf8');
    const exportRe = /export const (\w+) = sqliteTable\(\s*'([^']+)'/g;
    let m;
    while ((m = exportRe.exec(content)) !== null) {
      const tableName = m[2];
      const start = m.index;
      const end = content.indexOf(');', start);
      if (end === -1) continue;
      const tableContent = content.substring(start, end);
      const cols = new Set();
      const colRe = /(\w+):\s*(?:integer|text|real|blob|boolean)\s*\(\s*['"]?(\w+)['"]?\s*\)/g;
      let cm;
      while ((cm = colRe.exec(tableContent)) !== null) {
        cols.add(cm[2]);
      }
      tables[tableName] = { columns: cols, file, varName: m[1] };
    }
  }
  return tables;
}

function detect() {
  const baseline = loadBaseline();
  const migrations = parseMigrations();
  const schemas = parseSchemas();

  let newDriftCount = 0;
  let knownDriftCount = 0;
  let harmlessCount = 0;
  const lines = [];
  lines.push('Schema-vs-migration drift detection:');
  if (NO_FAIL) {
    lines.push('  (running with --no-fail: informational only, will not exit non-zero)');
  }
  lines.push('');

  for (const [tableName, schemaDef] of Object.entries(schemas)) {
    if (!migrations[tableName]) {
      const inBaseline = isInBaseline(baseline, 'schema-table', tableName, null);
      if (inBaseline) {
        lines.push(`✓ KNOWN: TABLE in schema but NOT in any active migration: ${tableName} (${schemaDef.file})`);
        knownDriftCount++;
      } else {
        lines.push(`⚠️  NEW: TABLE in schema but NOT in any active migration: ${tableName} (${schemaDef.file})`);
        newDriftCount++;
      }
      continue;
    }
    const migDef = migrations[tableName];
    const schemaOnlyCols = [...schemaDef.columns].filter(c => !migDef.columns.has(c));
    const migOnlyCols = [...migDef.columns].filter(c => !schemaDef.columns.has(c));

    for (const col of schemaOnlyCols) {
      const inBaseline = isInBaseline(baseline, 'schema-column', tableName, col);
      if (inBaseline) {
        lines.push(`✓ KNOWN: Schema has column '${col}' but migration does NOT: ${tableName} (${schemaDef.file})`);
        knownDriftCount++;
      } else {
        lines.push(`⚠️  NEW: Schema has column '${col}' but migration does NOT: ${tableName} (${schemaDef.file})`);
        newDriftCount++;
      }
    }
    for (const col of migOnlyCols) {
      lines.push(`ℹ️  Migration has column '${col}' but schema does NOT: ${tableName} (${migDef.file}) — harmless extra column`);
      harmlessCount++;
    }
  }

  for (const [tableName, migDef] of Object.entries(migrations)) {
    if (!schemas[tableName]) {
      const inBaseline = isInBaseline(baseline, 'migration-table', tableName, null);
      if (inBaseline) {
        lines.push(`✓ KNOWN: TABLE in migration but NOT in any schema: ${tableName} (${migDef.file})`);
        knownDriftCount++;
      } else {
        lines.push(`⚠️  NEW: TABLE in migration but NOT in any schema: ${tableName} (${migDef.file})`);
        newDriftCount++;
      }
    }
  }

  lines.push('');
  if (newDriftCount > 0 && !NO_FAIL) {
    lines.push('');
    lines.push('REMEDIATION:');
    lines.push('  New drift detected and CI is in BLOCKING mode. To resolve, either:');
    lines.push('  1. Add the missing migration in the SAME PR (preferred), OR');
    lines.push('  2. Add a baseline entry in apps/forge/scripts/schema-drift-detector/known-drift.json');
    lines.push('     with a follow-up issue to track the schema-vs-migration fix.');
    lines.push('  See issue #5489 for the rollout plan.');
    lines.push('');
  }
  lines.push(
    `Summary: ${newDriftCount} new drift (CI fail unless --no-fail) | ${knownDriftCount} known drift (baseline) | ${harmlessCount} harmless extras across ${Object.keys(schemas).length} schema tables`,
  );

  console.log(lines.join('\n'));
  process.exit(NO_FAIL ? 0 : (newDriftCount > 0 ? 1 : 0));
}

detect();
