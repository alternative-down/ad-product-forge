#!/usr/bin/env node
// Cold-start test for PR #6727 (P0 #6722 retry)
//
// L#NN-P0-Startup-Script-Risk-Assessment v1:
// - Sandbox env ONLY: no prod/dev URLs in env, no Coolify webhook, fresh libsql
// - Two scenarios: A (time-bomb defuse) + B (no regression happy path)
// - Exit codes: 0=PASS, 1=FAIL, 2=setup error
//
// Usage:
//   node apps/forge/scripts/cold-start-test/test.mjs [--scenario=a|b|both] [--keep-db] [--dist=PATH]
//   node apps/forge/scripts/cold-start-test/test.mjs --scenario=a --keep-db
//
// Run BEFORE deploying PR #6727 to dev/prod. Required gate per #6725 postmortem.
//
// References:
// - PR #6727 (the fix under test)
// - #6722 (P0: system_settings.created_at missing)
// - #6725 (postmortem: PR #6723 wrong-hash time-bomb)
// - L#NN-Drizzle-Hash-Includes-Comments v1
// - L#NN-Migration-Journal-Sync-After-Manual-Fix v2

import { createClient } from '@libsql/client';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../../..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'apps/forge/migrations');
const JOURNAL_PATH = join(MIGRATIONS_DIR, 'meta/_journal.json');

// Hardcoded values from PR #6727 / #6725 postmortem (do not derive at runtime
// to keep the test deterministic; if these change the test must be updated).
const WRONG_HASH_6723 = '66ab776775372a9034465edf2720f560ebfb8343';
const WRONG_HASH_CREATED_AT = 1775481600000;
const REAL_HASH_0031 = '0eaf0e90f17d12a64a579dd9e6edfb7338f3cc4ec78c6462da8fe3d9c4c262b6';
const FOLDER_MILLIS_0031 = 1781902527000;

// ─── CLI args ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { scenario: 'both', keepDb: false, dist: null };
  for (const a of argv.slice(2)) {
    if (a === '--keep-db') args.keepDb = true;
    else if (a.startsWith('--scenario=')) args.scenario = a.split('=')[1];
    else if (a.startsWith('--dist=')) args.dist = a.split('=')[1];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node test.mjs [--scenario=a|b|both] [--keep-db] [--dist=PATH]');
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadJournal() {
  const raw = readFileSync(JOURNAL_PATH, 'utf-8');
  return JSON.parse(raw);
}

function findMigrationFile(tag) {
  return join(MIGRATIONS_DIR, `${tag}.sql`);
}

/**
 * Apply migrations in idx order up to (and including) the highest idx <= maxIdx.
 * Splits each SQL file on the drizzle `--> statement-breakpoint` marker.
 */
import { createHash } from 'node:crypto';

async function applyMigrations(client, maxIdx) {
  // Ensure __drizzle_migrations exists (Drizzle migrator would do this on app start)
  await client.execute(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )`);
  const journal = loadJournal();
  for (const entry of journal.entries) {
    if (entry.idx > maxIdx) break;
    const filePath = findMigrationFile(entry.tag);
    if (!existsSync(filePath)) {
      throw new Error(`Migration file missing: ${filePath}`);
    }
    const content = readFileSync(filePath, 'utf-8');
    const statements = content.split(/--> statement-breakpoint/g);
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed.length === 0) continue;
      await client.execute(trimmed);
    }
    // Insert journal row (hash of FULL SQL + folderMillis when)
    const hash = createHash('sha256').update(content).digest('hex');
    await client.execute({
      sql: 'INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)',
      args: [hash, entry.when],
    });
  }
}

async function spawnApp({ dbPath, httpPort, distPath }) {
  const env = {
    ...process.env,
    FORGE_DATA_PATH: dirname(dbPath),
    FORGE_HTTP_PORT: String(httpPort),
    NODE_ENV: 'test',
    FORGE_ADMIN_ALLOW_INSECURE_LOCAL: 'true',
    FORGE_ADMIN_API_KEY: 'cold-start-test-key',
    FORGE_DEBUG: 'true',
  };
  const child = spawn('node', [distPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: REPO_ROOT,
  });
  let stdoutBuf = '';
  let stderrBuf = '';
  child.stdout.on('data', (chunk) => { stdoutBuf += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString(); });
  return { child, getStdout: () => stdoutBuf, getStderr: () => stderrBuf };
}

async function waitForHttp(port, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/admin/system/healthcheck`, {
        headers: { 'x-forge-admin-api-key': 'cold-start-test-key' },
      });
      if (res.status === 200) return true;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function queryJournal(client) {
  const res = await client.execute('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at');
  return res.rows.map((r) => ({ hash: r.hash, created_at: Number(r.created_at) }));
}

async function columnExists(client, tableName, columnName) {
  // SQLite: PRAGMA table_info returns rows with name column
  const res = await client.execute(`PRAGMA table_info(${tableName})`);
  return res.rows.some((r) => r.name === columnName);
}

function killProcess(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolveKill) => {
    child.once('exit', () => resolveKill());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 5000);
  });
}

// ─── Scenarios ───────────────────────────────────────────────────────────────
async function runScenarioA({ distPath }) {
  const scenarioName = 'A (time-bomb defuse)';
  console.log(`\n=== Scenario ${scenarioName} ===`);
  const tmpDir = mkdtempSync(join(tmpdir(), 'forge-coldstart-a-'));
  const dbPath = join(tmpDir, 'agents.db');
  const httpPort = 18923;
  const steps = [];

  try {
    // Step 1: Apply migrations 0000-0030 (skip 0031 to replicate missing column state)
    const client = createClient({ url: `file:${dbPath}` });
    await client.execute('PRAGMA journal_mode=WAL');
    // applyMigrations() now creates __drizzle_migrations internally
    await applyMigrations(client, 30);
    steps.push({ name: 'apply migrations 0000-0030', pass: true });

    // Step 2: Insert wrong-hash row (simulates PR #6723 leftover)
    await client.execute({
      sql: 'INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)',
      args: [WRONG_HASH_6723, WRONG_HASH_CREATED_AT],
    });
    steps.push({ name: 'insert wrong-hash row', pass: true });

    // Step 3: Spawn app
    const { child, getStdout, getStderr } = await spawnApp({ dbPath, httpPort, distPath });

    // Step 4: Wait for HTTP listening
    const httpOk = await waitForHttp(httpPort);
    if (!httpOk) {
      await killProcess(child);
      steps.push({ name: 'app HTTP listening', pass: false, reason: 'timeout 30s; stderr=' + getStderr().slice(-500) });
    } else {
      steps.push({ name: 'app HTTP listening', pass: true });

      // Step 5: Query journal, expect wrong hash absent, real 0031 present
      const rows = await queryJournal(client);
      const wrongPresent = rows.some((r) => r.hash === WRONG_HASH_6723);
      const realPresent = rows.some(
        (r) => r.hash === REAL_HASH_0031 && r.created_at === FOLDER_MILLIS_0031,
      );
      steps.push({ name: 'wrong hash removed from journal', pass: !wrongPresent });
      steps.push({ name: 'real 0031 hash present in journal', pass: realPresent });

      // Step 6: Verify created_at column exists
      const hasCol = await columnExists(client, 'system_settings', 'created_at');
      steps.push({ name: 'system_settings.created_at column exists', pass: hasCol });

      // Step 7: Verify cleanupFixupJournalEntry log line
      const stdout = getStdout();
      const cleanupRan = /removed wrong journal entry from fixup|cleanupFixupJournalEntry/i.test(stdout);
      steps.push({ name: 'cleanupFixupJournalEntry ran (log evidence)', pass: cleanupRan });

      await killProcess(child);
    }
    client.close();
  } catch (err) {
    steps.push({ name: 'scenario setup', pass: false, reason: err.message });
  } finally {
    if (!args.keepDb) rmSync(tmpDir, { recursive: true, force: true });
  }

  return { name: scenarioName, steps };
}

async function runScenarioB({ distPath }) {
  const scenarioName = 'B (happy path, no regression)';
  console.log(`\n=== Scenario ${scenarioName} ===`);
  const tmpDir = mkdtempSync(join(tmpdir(), 'forge-coldstart-b-'));
  const dbPath = join(tmpDir, 'agents.db');
  const httpPort = 18924;
  const steps = [];

  try {
    // Step 1: Apply all migrations 0000-0037
    const client = createClient({ url: `file:${dbPath}` });
    await client.execute('PRAGMA journal_mode=WAL');
    await applyMigrations(client, 37);
    steps.push({ name: 'apply all migrations 0000-0037', pass: true });

    // Step 2: Spawn app
    const { child, getStdout, getStderr } = await spawnApp({ dbPath, httpPort, distPath });

    // Step 3: Wait for HTTP listening
    const httpOk = await waitForHttp(httpPort);
    if (!httpOk) {
      await killProcess(child);
      steps.push({ name: 'app HTTP listening', pass: false, reason: 'timeout 30s; stderr=' + getStderr().slice(-500) });
    } else {
      steps.push({ name: 'app HTTP listening', pass: true });

      // Step 4: Verify created_at column exists
      const hasCol = await columnExists(client, 'system_settings', 'created_at');
      steps.push({ name: 'system_settings.created_at column exists', pass: hasCol });

      // Step 5: Verify real 0031 hash present, wrong hash absent (idempotent state)
      const rows = await queryJournal(client);
      const wrongPresent = rows.some((r) => r.hash === WRONG_HASH_6723);
      const realPresent = rows.some(
        (r) => r.hash === REAL_HASH_0031 && r.created_at === FOLDER_MILLIS_0031,
      );
      steps.push({ name: 'wrong hash absent (clean state)', pass: !wrongPresent });
      steps.push({ name: 'real 0031 hash present', pass: realPresent });

      // Step 6: Verify cleanupFixupJournalEntry was idempotent (no log emitted because state was already clean)
      const stdout = getStdout();
      const cleanupActionLogged = /cleanupFixupJournalEntry: (removed|inserted)/i.test(stdout);
      steps.push({ name: 'cleanupFixupJournalEntry no-op (idempotent)', pass: !cleanupActionLogged });

      await killProcess(child);
    }
    client.close();
  } catch (err) {
    steps.push({ name: 'scenario setup', pass: false, reason: err.message });
  } finally {
    if (!args.keepDb) rmSync(tmpDir, { recursive: true, force: true });
  }

  return { name: scenarioName, steps };
}

// ─── Main ────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv);

const distPath = args.dist
  ? resolve(args.dist)
  : join(REPO_ROOT, 'apps/forge/dist/main.js');

if (!existsSync(distPath)) {
  console.error(`❌ App dist not found: ${distPath}`);
  console.error('   Run `npm run build` in apps/forge first, OR pass --dist=PATH');
  process.exit(2);
}

console.log(`Cold-start test — sandbox env only`);
console.log(`  Dist:    ${distPath}`);
console.log(`  Scenario: ${args.scenario}`);
console.log(`  Keep DB:  ${args.keepDb}`);

const scenarios = [];
if (args.scenario === 'a' || args.scenario === 'both') {
  scenarios.push(await runScenarioA({ distPath }));
}
if (args.scenario === 'b' || args.scenario === 'both') {
  scenarios.push(await runScenarioB({ distPath }));
}

// Report
let totalPass = 0;
let totalFail = 0;
let scenarioFail = false;
for (const s of scenarios) {
  console.log(`\n--- Result: scenario ${s.name} ---`);
  for (const step of s.steps) {
    if (step.pass) {
      console.log(`  [PASS] ${step.name}`);
      totalPass++;
    } else {
      console.log(`  [FAIL] ${step.name}${step.reason ? ': ' + step.reason : ''}`);
      totalFail++;
      scenarioFail = true;
    }
  }
}

console.log(`\n=== SUMMARY: ${totalPass} pass / ${totalFail} fail across ${scenarios.length} scenario(s) ===`);
process.exit(scenarioFail ? 1 : 0);
