/**
 * Static-analysis guard test for Format A vs Format B in finance/ directory.
 * (Issue #5634 — L#19 risk cluster.)
 *
 * Enforces Format A (structured error logging via withDbErrorLogging)
 * across finance/ files. Mirrors the existing pattern in
 * apps/forge/src/database/error-logging.test.ts (issue #5485) but scoped
 * to finance/ files specifically.
 *
 * Why finance/ needs its own guard:
 * - The existing tripwire only scans *.store.ts files (regex /store\.ts$/)
 * - finance/ uses different naming: company-cash-ledger.ts, company-payables.ts,
 *   payment-receivables.ts, payment-providers/asaas.ts, payment-providers/stripe.ts,
 *   payment-schema.ts
 * - Without this guard, Format B can creep into finance/ silently
 *
 * Pattern detection (same as #5485):
 *   Format B (BAD):
 *     - message: '<prefix>' + errorMsg(err)   (string concat)
 *     - message: `...${errorMsg(err)}...`  (template literal)
 *   Format A (OK):
 *     - withDbErrorLogging({ scope, op, verb, context, fn })
 *     - forgeDebug for warn-level business validation (KEEP these)
 *
 * Allowed exceptions:
 * - forgeDebug calls with level: 'warn' for business validation (not DB errors)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const FORGE_SRC = import.meta.dirname;

/** Recursively collect all .ts files under apps/forge/src/finance/ */
function collectFinanceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectFinanceFiles(fullPath));
    } else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Detect Format-B pattern in a file.
 * Same logic as error-logging.test.ts (issue #5485).
 */
function findFormatBLocations(content: string): Array<{ line: number; text: string }> {
  const lines = content.split('\n');
  const results: Array<{ line: number; text: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Pattern 1: message: '...' + errorMsg(err) (string concatenation)
    if (/message:\s*['"`].*['"`]\s*\+\s*errorMsg\s*\(/.test(line)) {
      results.push({ line: i + 1, text: line.trim() });
      continue;
    }
    // Pattern 2: message: `...${errorMsg(err)}...` (template literal)
    if (/message:\s*`[^`]*\$\{[^}]*errorMsg\s*\(/.test(line)) {
      results.push({ line: i + 1, text: line.trim() });
    }
  }
  return results;
}

describe('Log format guard for finance/ (issue #5634, Format A)', () => {
  const financeFiles = collectFinanceFiles(FORGE_SRC);

  it('finds finance files (sanity)', () => {
    expect(financeFiles.length).toBeGreaterThan(0);
  });

  it('no Format-B sites in finance/ (issue #5634 migration completed)', () => {
    const violations: Array<{ file: string; line: number; text: string }> = [];
    for (const file of financeFiles) {
      const content = readFileSync(file, 'utf8');
      const matches = findFormatBLocations(content);
      for (const match of matches) {
        violations.push({
          file: file.replace(process.cwd() + '/', ''),
          line: match.line,
          text: match.text,
        });
      }
    }
    if (violations.length > 0) {
      const summary = violations
        .map((v) => '  ' + v.file + ':' + v.line + '\n    ' + v.text)
        .join('\n');
      throw new Error(
        'Found ' +
          violations.length +
          ' Format-B log site(s) in finance/.\n' +
          'Format A is the canonical spec (see apps/forge/src/database/error-logging.ts).\n' +
          'Migrate sites to withDbErrorLogging to emit Format A.\n\n' +
          summary,
      );
    }
    expect(violations).toHaveLength(0);
  });

  it('warn-level forgeDebug calls are allowed for business validation', () => {
    // Forge calls like forgeDebug({ level: warn, message: X not found }) are
    // business validation, NOT DB errors. These should NOT be flagged.
    // This test documents the allowed exception.
    let warnCallCount = 0;
    for (const file of financeFiles) {
      const content = readFileSync(file, 'utf8');
      const warnCalls = content.match(/level:\s*['"]warn['"]/g) || [];
      warnCallCount += warnCalls.length;
    }
    // After migration: company-cash-operations.ts (3) + company-payables.ts (1) + asaas.ts (2) = 6
    expect(warnCallCount).toBeGreaterThanOrEqual(6);
  });

  it('migrated files import withDbErrorLogging (Format A)', () => {
    // Structural check: ensure the migrated files use withDbErrorLogging helper,
    // not just forgeDebug. This complements the static Format-B guard above.
    const migratedFiles = [
      'company-cash-ledger.ts',
      'company-cash-operations.ts',
    ];
    for (const file of migratedFiles) {
      const fullPath = join(FORGE_SRC, file);
      const content = readFileSync(fullPath, 'utf8');
      expect(content).toContain("from '../database/error-logging'");
      expect(content).toContain('withDbErrorLogging');
    }
  });

  it('Format B sites count is exactly 0 after migration', () => {
    // Runtime companion to the static guard: count Format B occurrences.
    let formatBCount = 0;
    for (const file of financeFiles) {
      const fileContent = readFileSync(file, 'utf8');
      const matches = findFormatBLocations(fileContent);
      formatBCount += matches.length;
    }
    expect(formatBCount).toBe(0);
  });
});