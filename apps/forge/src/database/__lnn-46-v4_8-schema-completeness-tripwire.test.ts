/**
 * L#NN-46 v4.8 SCHEMA-COMPLETENESS tripwire (Day 39 #6332)
 *
 * Asserts: every CREATE TABLE in migrations has a corresponding sqliteTable
 * declaration in some schema file (database/ or finance/).
 *
 * Background: #6315 P0 (dev env 503) was rooted in missing migration 0035.
 * The 4 payment tables (payment_providers, payment_customers,
 * payment_subscriptions, payment_transactions) were defined in
 * apps/forge/src/finance/payment-schema.ts — OUTSIDE the schema-detector
 * scope (apps/forge/src/database/).
 *
 * The schema-drift-detector (apps/forge/scripts/schema-drift-detector/detect.mjs)
 * would normally flag these 4 tables as NEW drift (table in migration but NOT
 * in any schema). The audit-accept path adds them to known-drift.json with
 * tracked_by: issue-#6332.
 *
 * Tripwire scope: running the detector MUST report 0 NEW drift. If a NEW
 * migration introduces a table that is NOT declared in any schema file,
 * this test will fail (CI-blocking) — replacing the manual audit-accept path
 * with an automated guard.
 *
 * Tripwire grade: P2 (CI-blocking on detected drift). Codification:
 * L#NN-46 v4.8 SCHEMA-COMPLETENESS, tracked in detect.mjs + known-drift.json.
 *
 * See also:
 * - L#NN-46 v4.7 migration-orphan tripwire (__lnn-46-migration-orphan-tripwire.test.ts)
 * - L#NN-46 v4.8 schema-fk-text-no-references tripwire (__lnn-46-schema-fk-text-no-references-tripwire.test.ts)
 * - apps/forge/scripts/schema-drift-detector/detect.mjs (canonical detector)
 * - apps/forge/scripts/schema-drift-detector/known-drift.json (audit baseline)
 * - PR #6331 (root cause fix), issue #6332 (audit task)
 */

import { describe, expect, it } from 'vitest';
import { } from '../tripwire-helpers'; // D61: tripwire-helpers adoption (L#NN-32 v8 meta-tripwire)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const DETECT_SCRIPT = join(REPO_ROOT, 'apps/forge/scripts/schema-drift-detector/detect.mjs');
const BASELINE_FILE = join(REPO_ROOT, 'apps/forge/scripts/schema-drift-detector/known-drift.json');

interface BaselineEntry {
  id: string;
  type: 'schema-only-column' | 'schema-table' | 'migration-table';
  table: string;
  column?: string;
  schema_file?: string;
  reason: string;
  introduced_in?: {
    commit?: string;
    pr?: number;
    summary?: string;
  };
  tracked_by?: string;
  added_at: string;
  added_by: string;
  investigation_needed?: string;
}

interface Baseline {
  version: number;
  lastUpdated: string;
  description: string;
  entries: BaselineEntry[];
}

function runDetector(): string {
  try {
    return execSync(`node ${DETECT_SCRIPT} ${REPO_ROOT} --no-fail`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err: any) {
    // detector exits 1 on new drift, but --no-fail forces exit 0
    // if executed correctly this branch should not be hit
    return err.stdout || err.message;
  }
}

function loadBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline;
}

describe('L#NN-46 v4.8 SCHEMA-COMPLETENESS tripwire (Day 39 #6332)', () => {
  const output = runDetector();
  const baseline = loadBaseline();

  // Parse the summary line: "Summary: <new> new drift (CI fail unless --no-fail) | <known> known drift..."
  const summaryMatch = output.match(/Summary:\s+(\d+)\s+new\s+drift.*?\|\s+(\d+)\s+known\s+drift.*?\|\s+(\d+)\s+harmless\s+extras\s+across\s+(\d+)\s+schema\s+tables/);
  const newDriftCount = summaryMatch ? parseInt(summaryMatch[1], 10) : -1;
  const knownDriftCount = summaryMatch ? parseInt(summaryMatch[2], 10) : -1;
  const schemaTableCount = summaryMatch ? parseInt(summaryMatch[4], 10) : -1;

  it('detector ran successfully and produced a summary', () => {
    expect(summaryMatch).not.toBeNull();
    expect(newDriftCount).toBeGreaterThanOrEqual(0);
    expect(knownDriftCount).toBeGreaterThanOrEqual(0);
    expect(schemaTableCount).toBeGreaterThan(0);
  });

  it('reports ZERO new drift (CI-blocking guard)', () => {
    // If new drift is detected, the detector would have exited 1 in blocking mode.
    // This tripwire is the CI-blocking equivalent: any new drift fails the build.
    expect(newDriftCount).toBe(0);
  });

  it('baseline includes the 4 audit-accepted payment tables (from #6331 fix)', () => {
    const auditAccepted = new Set(
      baseline.entries
        .filter((e) => e.type === 'migration-table')
        .map((e) => e.table),
    );
    expect(auditAccepted.has('payment_providers')).toBe(true);
    expect(auditAccepted.has('payment_customers')).toBe(true);
    expect(auditAccepted.has('payment_subscriptions')).toBe(true);
    expect(auditAccepted.has('payment_transactions')).toBe(true);
  });

  it('audit-accepted payment tables are tracked by issue #6332', () => {
    const paymentEntries = baseline.entries.filter(
      (e) =>
        e.type === 'migration-table' &&
        ['payment_providers', 'payment_customers', 'payment_subscriptions', 'payment_transactions'].includes(e.table),
    );
    expect(paymentEntries.length).toBe(4);
    for (const entry of paymentEntries) {
      expect(entry.tracked_by).toBe('issue-#6332');
    }
  });

  it('baseline knows about the architectural choice (finance/ outside database/)', () => {
    const paymentEntries = baseline.entries.filter(
      (e) => e.type === 'migration-table' && e.table.startsWith('payment_'),
    );
    for (const entry of paymentEntries) {
      expect(entry.investigation_needed).toContain('finance/payment-schema.ts');
      expect(entry.investigation_needed).toMatch(/outside detector scope|architectural/i);
    }
  });

  it('baseline version is current (D39 #6332 audit-accept batch)', () => {
    expect(baseline.lastUpdated).toBe('2026-08-08');
  });

  it('every baseline entry has a tracked_by issue or investigation_needed note', () => {
    // hygiene: no orphan entries
    for (const entry of baseline.entries) {
      const hasTracking =
        entry.tracked_by !== undefined ||
        (entry.investigation_needed !== undefined && entry.investigation_needed.length > 0);
      expect(hasTracking).toBe(true);
    }
  });

  it('detector marks the 4 payment tables as KNOWN (NOT NEW) in its output', () => {
    const lines = output.split('\n').filter((l) => l.includes('payment_'));
    expect(lines.length).toBe(4);
    for (const line of lines) {
      expect(line).toMatch(/KNOWN.*payment_/);
      expect(line).not.toMatch(/NEW.*payment_/);
    }
  });

  it('known drift count is at least 39 (35 legacy + 4 audit-accepted payment tables)', () => {
    // Pre-#6331: 35 known entries
    // Post-#6331: 35 + 4 payment tables = 39
    expect(knownDriftCount).toBeGreaterThanOrEqual(39);
  });
});
