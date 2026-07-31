// Multi-line DDL regression tests for schema-drift-detector.
// Pins the L#NN-50 #33 regex fixes (#6170 alterRe, #6185 tableRe + renameRe)
// and the DROP-before-RENAME order invariant from SKILL.md origin story.
//
// Run with: node --test apps/forge/scripts/schema-drift-detector/__tests__/detect-multiline.test.mjs

import { describe, it, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT = resolve(__dirname, "..", "detect.mjs");

// Character constants to avoid heredoc-escape issues with backticks
const BT = String.fromCharCode(96);
const NL = String.fromCharCode(10);
const SQ = String.fromCharCode(39);

let TMP_ROOT;
function setupTmpRepo() {
  TMP_ROOT = mkdtempSync(join(tmpdir(), "drift-ml-test-"));
  mkdirSync(join(TMP_ROOT, "apps/forge/migrations"), { recursive: true });
  mkdirSync(join(TMP_ROOT, "apps/forge/src/database"), { recursive: true });
  mkdirSync(join(TMP_ROOT, "scripts/schema-drift-detector"), { recursive: true });
  return TMP_ROOT;
}
function cleanupTmpRepo() {
  if (TMP_ROOT && existsSync(TMP_ROOT)) {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  }
}
function copyScriptTo(repoRoot) {
  const scriptSource = readFileSync(SCRIPT, "utf8");
  writeFileSync(join(repoRoot, "scripts/schema-drift-detector/detect.mjs"), scriptSource);
}
function copyBaselineTo(repoRoot, baselineContent) {
  writeFileSync(
    join(repoRoot, "scripts/schema-drift-detector/known-drift.json"),
    JSON.stringify(baselineContent, null, 2),
  );
}
function writeMigration(repoRoot, name, content) {
  writeFileSync(join(repoRoot, "apps/forge/migrations", name), content);
}
function writeSchema(repoRoot, name, content) {
  writeFileSync(join(repoRoot, "apps/forge/src/database", name), content);
}
function runDetect(repoRoot, scriptSubpath = "scripts/schema-drift-detector/detect.mjs") {
  try {
    const output = execSync("node " + join(repoRoot, scriptSubpath), { cwd: repoRoot, encoding: "utf8" });
    return { code: 0, output };
  } catch (err) {
    return { code: err.status, output: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

// Helper: build multi-line SQL
function ml(parts) { return parts.join("\n"); }

describe("schema-drift-detector multi-line DDL (L#NN-50 #33 fix)", () => {
  after(cleanupTmpRepo);

  it("handles multi-line CREATE TABLE (tableRe fix #6185)", () => {
    TMP_ROOT = setupTmpRepo();
  copyScriptTo(TMP_ROOT);
  copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
  writeMigration(
    TMP_ROOT,
    "0000_test.sql",
    ml([
      "CREATE TABLE " + BT + "users" + BT + " (",
      "  " + BT + "id" + BT + " text NOT NULL,",
      "  " + BT + "name" + BT + " text NOT NULL,",
      "  " + BT + "email" + BT + " text NOT NULL",
      ");",
    ]),
  );
  writeSchema(
    TMP_ROOT,
    "schema-test.ts",
    ml([
      "export const users = sqliteTable(",
      "  " + SQ + "users" + SQ + ", {",
      "  id: text(" + SQ + "id" + SQ + ").primaryKey(),",
      "  name: text(" + SQ + "name" + SQ + "),",
      "  email: text(" + SQ + "email" + SQ + "),",
      "});",
    ]),
  );
  const { code, output } = runDetect(TMP_ROOT);
  assert.equal(code, 0, "Multi-line CREATE TABLE should parse. Got exit " + code + "\n" + output);
  assert.match(output, /Summary: 0 new drift/);
  cleanupTmpRepo();
});

it("handles multi-line CREATE TABLE IF NOT EXISTS (tableRe IF NOT EXISTS variant)", () => {
  TMP_ROOT = setupTmpRepo();
  copyScriptTo(TMP_ROOT);
  copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
  writeMigration(
    TMP_ROOT,
    "0001_test.sql",
    ml([
      "CREATE TABLE IF NOT EXISTS " + BT + "events" + BT + " (",
      "  " + BT + "id" + BT + " text NOT NULL,",
      "  " + BT + "kind" + BT + " text NOT NULL",
      ");",
    ]),
  );
  writeSchema(
    TMP_ROOT,
    "schema-test.ts",
    ml([
      "export const events = sqliteTable(",
      "  " + SQ + "events" + SQ + ", {",
      "  id: text(" + SQ + "id" + SQ + ").primaryKey(),",
      "  kind: text(" + SQ + "kind" + SQ + "),",
      "});",
    ]),
  );
  const { code, output } = runDetect(TMP_ROOT);
  assert.equal(code, 0, "Multi-line CREATE TABLE IF NOT EXISTS should parse. Got exit " + code + "\n" + output);
  assert.match(output, /Summary: 0 new drift/);
  cleanupTmpRepo();
});

it("handles multi-line ALTER TABLE ADD COLUMN (alterRe fix #6170)", () => {
  // Reproduces the #0034 currency column shape that surfaced this bug.
  TMP_ROOT = setupTmpRepo();
  copyScriptTo(TMP_ROOT);
  copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
  writeMigration(
    TMP_ROOT,
    "0000_test.sql",
    ml([
      "CREATE TABLE " + BT + "company_cash_ledger" + BT + " (",
      "  " + BT + "id" + BT + " text NOT NULL,",
      "  " + BT + "amount" + BT + " integer NOT NULL",
      ");",
      "ALTER TABLE " + BT + "company_cash_ledger" + BT,
      "  ADD COLUMN " + BT + "currency" + BT + " text NOT NULL DEFAULT " + SQ + "usd" + SQ + ";",
    ]),
  );
  writeSchema(
    TMP_ROOT,
    "schema-test.ts",
    ml([
      "export const companyCashLedger = sqliteTable(",
      "  " + SQ + "company_cash_ledger" + SQ + ", {",
      "  id: text(" + SQ + "id" + SQ + ").primaryKey(),",
      "  amount: integer(" + SQ + "amount" + SQ + "),",
      "  currency: text(" + SQ + "currency" + SQ + "),",
      "});",
    ]),
  );
  const { code, output } = runDetect(TMP_ROOT);
  assert.equal(code, 0, "Multi-line ALTER TABLE ADD COLUMN should parse. Got exit " + code + "\n" + output);
  assert.match(output, /Summary: 0 new drift/);
  cleanupTmpRepo();
});

it("handles multi-line ALTER TABLE RENAME TO (renameRe fix #6185)", () => {
  TMP_ROOT = setupTmpRepo();
  copyScriptTo(TMP_ROOT);
  copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
  writeMigration(
    TMP_ROOT,
    "0010_refactor.sql",
    ml([
      "CREATE TABLE " + BT + "__new_agents" + BT + " (",
      "  " + BT + "id" + BT + " text NOT NULL,",
      "  " + BT + "name_v2" + BT + " text NOT NULL",
      ");",
      "INSERT INTO " + BT + "__new_agents" + BT + " SELECT * FROM " + BT + "agents" + BT + ";",
      "DROP TABLE " + BT + "agents" + BT + ";",
      "ALTER TABLE",
      "  " + BT + "__new_agents" + BT,
      "  RENAME TO " + BT + "agents" + BT + ";",
    ]),
  );
  writeSchema(
    TMP_ROOT,
    "schema-test.ts",
    ml([
      "export const agents = sqliteTable(",
      "  " + SQ + "agents" + SQ + ", {",
      "  id: text(" + SQ + "id" + SQ + ").primaryKey(),",
      "  name_v2: text(" + SQ + "name_v2" + SQ + "),",
      "});",
    ]),
  );
  const { code, output } = runDetect(TMP_ROOT);
  assert.equal(code, 0, "Multi-line ALTER TABLE RENAME TO should parse. Got exit " + code + "\n" + output);
  assert.match(output, /Summary: 0 new drift/);
  cleanupTmpRepo();
});

it("preserves DROP-before-RENAME order invariant (SKILL.md origin bug)", () => {
  // SKILL.md "Origin story": the first version of this script had RENAME
  // before DROP and reported agents as missing. This test pins the
  // invariant: a refactor migration that does DROP then RENAME must
  // leave agents registered in the final state.
  TMP_ROOT = setupTmpRepo();
  copyScriptTo(TMP_ROOT);
  copyBaselineTo(TMP_ROOT, { version: 1, entries: [] });
  writeMigration(
    TMP_ROOT,
    "0010_refactor.sql",
    "CREATE TABLE " + BT + "__new_agents" + BT + " (" + BT + "id" + BT + " text NOT NULL, " + BT + "name" + BT + " text NOT NULL);" +
      "INSERT INTO " + BT + "__new_agents" + BT + " SELECT * FROM " + BT + "agents" + BT + ";" +
      "DROP TABLE " + BT + "agents" + BT + ";" +
      "ALTER TABLE " + BT + "__new_agents" + BT + " RENAME TO " + BT + "agents" + BT + ";",
  );
  writeSchema(
    TMP_ROOT,
    "schema-test.ts",
    ml([
      "export const agents = sqliteTable(",
      "  " + SQ + "agents" + SQ + ", {",
      "  id: text(" + SQ + "id" + SQ + ").primaryKey(),",
      "  name: text(" + SQ + "name" + SQ + "),",
      "});",
    ]),
  );
  const { code, output } = runDetect(TMP_ROOT);
  assert.equal(code, 0, "DROP-before-RENAME invariant: agents must remain registered. Got exit " + code + "\n" + output);
  assert.match(output, /Summary: 0 new drift/);
  cleanupTmpRepo();
});
});
