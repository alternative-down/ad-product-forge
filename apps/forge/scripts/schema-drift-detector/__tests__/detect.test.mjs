// End-to-end tests for the schema-drift-detector
// Uses a tmp directory with mock migrations/schemas to verify the script
// handles real-world edge cases (DDL phase order, baseline, etc.)
//
// Run with: node apps/forge/scripts/schema-drift-detector/__tests__/detect.test.mjs
// Or:       npx vitest run apps/forge/scripts/schema-drift-detector/__tests__/detect.test.mjs
//
// Uses Node's built-in test runner (node:test) — no extra deps required.

import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT = resolve(__dirname, '..', 'detect.mjs');
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

let TMP_ROOT;

function setupTmpRepo() {
  TMP_ROOT = mkdtempSync(join(tmpdir(), 'drift-test-'));
  mkdirSync(join(TMP_ROOT, 'apps/forge/migrations'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'apps/forge/migrations/meta'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'apps/forge/src/database'), { recursive: true });
  // Schema directory needs the script's detect.mjs relative path
  // (script computes BASELINE_FILE from __dirname)
  // We need to also place known-drift.json in the script's directory
  // but the script reads it from its own location. For tests, we set up
  // the script in a tmp dir alongside the baseline.
  return TMP_ROOT;
}

function cleanupTmpRepo() {
  if (TMP_ROOT && existsSync(TMP_ROOT)) {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  }
}

function copyScriptTo(repoRoot) {
  // Place the script + baseline file in a location the test can run from.
  // The script reads BASELINE_FILE from its own __dirname, so we put
  // a known-drift.json alongside the script in the test workspace.
  mkdirSync(join(repoRoot, 'scripts/schema-drift-detector'), { recursive: true });
  const scriptSource = readFileSync(SCRIPT, 'utf8');
  writeFileSync(join(repoRoot, 'scripts/schema-drift-detector/detect.mjs'), scriptSource);
}

function copyBaselineTo(repoRoot, baselineContent) {
  writeFileSync(
    join(repoRoot, 'scripts/schema-drift-detector/known-drift.json'),
    JSON.stringify(baselineContent, null, 2),
  );
}

function writeMigration(repoRoot, name, content) {
  writeFileSync(join(repoRoot, 'apps/forge/migrations', name), content);
}

function writeSchema(repoRoot, name, content) {
  writeFileSync(join(repoRoot, 'apps/forge/src/database', name), content);
}

function runDetect(repoRoot, extraArgs = [], scriptSubpath = 'scripts/schema-drift-detector/detect.mjs') {
  try {
    const output = execSync(`node ${join(repoRoot, scriptSubpath)} ${extraArgs.join(' ')}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return { code: 0, output };
  } catch (err) {
    return { code: err.status, output: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

import { readFileSync } from 'node:fs';

describe('schema-drift-detector', () => {
  after(cleanupTmpRepo);

  describe('parseMigrations: DDL phase order', () => {
    it('handles CREATE TABLE + DROP TABLE (basic)', () => {
      TMP_ROOT = setupTmpRepo();
      copyScriptTo(TMP_ROOT);
      copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
      writeMigration(
        TMP_ROOT,
        '0000_test.sql',
        'CREATE TABLE `users` (`id` text NOT NULL, `name` text NOT NULL);' +
          'DROP TABLE `users`;',
      );
      writeSchema(TMP_ROOT, 'schema-test.ts', '');
      const { code, output } = runDetect(TMP_ROOT);
      assert.equal(code, 0, `Expected exit 0, got ${code}\n${output}`);
      assert.match(output, /Summary: 0 new drift/);
      cleanupTmpRepo();
    });

    it('handles RENAME pattern: CREATE __new_X, DROP Y, RENAME __new_X to Y', () => {
      // This is the SQLite ALTER TABLE refactor pattern.
      // Bug case: RENAME before DROP would delete the just-renamed table.
      TMP_ROOT = setupTmpRepo();
      copyScriptTo(TMP_ROOT);
      copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
      writeMigration(
        TMP_ROOT,
        '0010_refactor.sql',
        'CREATE TABLE `__new_agents` (`id` text NOT NULL, `name_v2` text NOT NULL);' +
          'INSERT INTO `__new_agents` SELECT * FROM `agents`;' +
          'DROP TABLE `agents`;' +
          'ALTER TABLE `__new_agents` RENAME TO `agents`;',
      );
      writeSchema(
        TMP_ROOT,
        'schema-test.ts',
        "import { sqliteTable, text } from 'drizzle-orm/sqlite-core';" +
          "export const agents = sqliteTable('agents', { id: text('id').primaryKey(), name: text('name_v2') });",
      );
      const { code, output } = runDetect(TMP_ROOT);
      assert.equal(code, 0, `Expected exit 0, got ${code}\n${output}`);
      // After the refactor, `agents` should exist (not be deleted by RENAME)
      // and should have `name_v2` column.
      assert.match(output, /Summary: 0 new drift/);
      cleanupTmpRepo();
    });

    it('catches column drift when schema adds a column not in migration', () => {
      TMP_ROOT = setupTmpRepo();
      copyScriptTo(TMP_ROOT);
      copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
      writeMigration(
        TMP_ROOT,
        '0000_test.sql',
        'CREATE TABLE `agents` (`id` text NOT NULL);',
      );
      writeSchema(
        TMP_ROOT,
        'schema-test.ts',
        "import { sqliteTable, text } from 'drizzle-orm/sqlite-core';" +
          "export const agents = sqliteTable('agents', {" +
          "  id: text('id').primaryKey()," +
          "  newCol: text('new_col').notNull()," +
          '});',
      );
      const { code, output } = runDetect(TMP_ROOT);
      assert.equal(code, 1, 'Expected exit 1 on column drift');
      assert.match(output, /new_col/);
      assert.match(output, /NEW/);
      cleanupTmpRepo();
    });

    it('catches table drift when schema defines a table not in any migration', () => {
      TMP_ROOT = setupTmpRepo();
      copyScriptTo(TMP_ROOT);
      copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
      writeMigration(
        TMP_ROOT,
        '0000_test.sql',
        'CREATE TABLE `agents` (`id` text NOT NULL);',
      );
      writeSchema(
        TMP_ROOT,
        'schema-test.ts',
        "import { sqliteTable, text } from 'drizzle-orm/sqlite-core';" +
          "export const agents = sqliteTable('agents', { id: text('id').primaryKey() });" +
          "export const missingTable = sqliteTable('missing_table', { id: text('id').primaryKey() });",
      );
      const { code, output } = runDetect(TMP_ROOT);
      assert.equal(code, 1, 'Expected exit 1 on table drift');
      assert.match(output, /missing_table/);
      assert.match(output, /NEW/);
      cleanupTmpRepo();
    });

    it('handles CREATE TABLE IF NOT EXISTS (regex fix)', () => {
      TMP_ROOT = setupTmpRepo();
      copyScriptTo(TMP_ROOT);
      copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
      writeMigration(
        TMP_ROOT,
        '0000_test.sql',
        'CREATE TABLE IF NOT EXISTS `agents` (`id` text NOT NULL);',
      );
      writeSchema(
        TMP_ROOT,
        'schema-test.ts',
        "import { sqliteTable, text } from 'drizzle-orm/sqlite-core';" +
          "export const agents = sqliteTable('agents', { id: text('id').primaryKey() });",
      );
      const { code, output } = runDetect(TMP_ROOT);
      assert.equal(code, 0, `IF NOT EXISTS should be parsed. Got exit ${code}\n${output}`);
      assert.match(output, /Summary: 0 new drift/);
      cleanupTmpRepo();
    });
  });

  describe('baseline handling', () => {
    it('reports drift as KNOWN when in baseline', () => {
      TMP_ROOT = setupTmpRepo();
      copyScriptTo(TMP_ROOT);
      copyBaselineTo(TMP_ROOT, {
        version: 1,
        entries: [
          {
            id: 'schema-column-agents.missing_col',
            type: 'schema-only-column',
            table: 'agents',
            column: 'missing_col',
            reason: 'manual_addition_no_migration',
          },
        ],
      });
      writeMigration(
        TMP_ROOT,
        '0000_test.sql',
        'CREATE TABLE `agents` (`id` text NOT NULL);',
      );
      writeSchema(
        TMP_ROOT,
        'schema-test.ts',
        "import { sqliteTable, text } from 'drizzle-orm/sqlite-core';" +
          "export const agents = sqliteTable('agents', {" +
          "  id: text('id').primaryKey()," +
          "  missingCol: text('missing_col').notNull()," +
          '});',
      );
      const { code, output } = runDetect(TMP_ROOT);
      assert.equal(code, 0, 'Baseline entry should suppress CI fail');
      assert.match(output, /KNOWN/);
      assert.match(output, /missing_col/);
      assert.match(output, /0 new drift/);
      cleanupTmpRepo();
    });

    it('reports drift as NEW when not in baseline', () => {
      TMP_ROOT = setupTmpRepo();
      copyScriptTo(TMP_ROOT);
      copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
      writeMigration(
        TMP_ROOT,
        '0000_test.sql',
        'CREATE TABLE `agents` (`id` text NOT NULL);',
      );
      writeSchema(
        TMP_ROOT,
        'schema-test.ts',
        "import { sqliteTable, text } from 'drizzle-orm/sqlite-core';" +
          "export const agents = sqliteTable('agents', {" +
          "  id: text('id').primaryKey()," +
          "  unlisted: text('unlisted_col').notNull()," +
          '});',
      );
      const { code, output } = runDetect(TMP_ROOT);
      assert.equal(code, 1, 'Drift not in baseline should fail');
      assert.match(output, /NEW/);
      cleanupTmpRepo();
    });

    it('--no-fail flag always exits 0 even with new drift', () => {
      TMP_ROOT = setupTmpRepo();
      copyScriptTo(TMP_ROOT);
      copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
      writeMigration(
        TMP_ROOT,
        '0000_test.sql',
        'CREATE TABLE `agents` (`id` text NOT NULL);',
      );
      writeSchema(
        TMP_ROOT,
        'schema-test.ts',
        "import { sqliteTable, text } from 'drizzle-orm/sqlite-core';" +
          "export const agents = sqliteTable('agents', {" +
          "  id: text('id').primaryKey()," +
          "  newCol: text('new_col').notNull()," +
          '});',
      );
      const { code, output } = runDetect(TMP_ROOT, ['--no-fail']);
      assert.equal(code, 0, '--no-fail should force exit 0');
      assert.match(output, /NEW/);
      assert.match(output, /informational only/);
      cleanupTmpRepo();
    });
  });

  describe('regression: real repo baseline', () => {
    it('script reports 0 NEW drift when run against develop with current baseline', () => {
      // This test runs against the real repo (not a tmp dir).
      // It validates that the baseline in this commit covers all real drift.
      const { code, output } = runDetect(resolve(__dirname, '../../../../..'), [], 'apps/forge/scripts/schema-drift-detector/detect.mjs');
      assert.equal(code, 0, `Real-repo drift check failed. Code: ${code}\n${output.slice(-2000)}`);
      assert.match(output, /0 new drift/);
    });
  });
});
