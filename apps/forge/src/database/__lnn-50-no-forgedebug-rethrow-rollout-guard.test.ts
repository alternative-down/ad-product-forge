/**
 * L#NN-50 tripwire test — no-forgeDebug-rethrow rollout guard (issue #5512).
 *
 * Purpose: Prevent regression of the forgeDebug+rethrow -> withDbErrorLogging
 * migration. After a file is migrated to use withDbErrorLogging for its
 * boilerplate try/catch+forgeDebug+rethrow pattern, this tripwire ensures
 * the manual pattern does not creep back in.
 *
 * Pattern detection:
 * - Migrated file MUST import withDbErrorLogging from ../database/error-logging
 *   (or appropriate relative path)
 * - Migrated file MUST have ZERO try/catch+forgeDebug+rethrow blocks
 * - Migrated file MUST use withDbErrorLogging at least once
 *
 * Migrated files (issue #5825 Phase 3 PR2, Day 20):
 * - apps/forge/src/system-settings/store.ts -- 1 try/catch+forgeDebug+rethrow block (this PR)
 *
 * Note: This file was created by Varek PR2 of Phase 3. Kaelen PR1 (llm/settings-store.ts)
 * will rebase and add llm/settings-store.ts entry after this PR lands.
 *
 * Out-of-scope patterns (RETAIN, not migrated):
 * - forgeDebug + return-defaults (info-level returning null, e.g. getSettings)
 * - forgeDebug + validation throws (e.g. argument validation)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const FORGE_SRC = join(import.meta.dirname, '..');

interface FileMigration {
  path: string;
  expectedForgeDebugRethrow: number; // remaining manual try/catch+forgeDebug+rethrow blocks (target: 0)
  expectedWithDbUsage: number; // minimum withDbErrorLogging call sites
}

/**
 * Registry of migrated files (forgeDebug+rethrow pattern eliminated).
 * Update when a new file is migrated.
 * Numbers verified at Day 20 09:15Z (PR2 of Phase 3).
 */
const MIGRATED_FILES: FileMigration[] = [
  {
    path: 'system-settings/store.ts',
    expectedForgeDebugRethrow: 0,
    expectedWithDbUsage: 1,
  },
];

/**
 * Pattern: try { ... } catch (...) { forgeDebug({...}); throw ...; }
 *
 * Regex matches: `} catch (X) {` followed within ~20 lines by `forgeDebug({`
 * followed by `throw X;` or `throw error;` or `throw err;`.
 *
 * We use a simple structural regex that's robust to most formatting.
 */
const FORGE_DEBUG_RETHROW_PATTERN =
  /}\s*catch\s*\([^)]*\)\s*\{[\s\S]{0,2000}?forgeDebug\s*\([\s\S]{0,2000}?throw\s+(?:error|err|e)\s*;/g;

function countOccurrences(content: string, pattern: RegExp): number {
  // Reset regex state since g flag has sticky behavior
  pattern.lastIndex = 0;
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function readSourceFile(relPath: string): string {
  return readFileSync(join(FORGE_SRC, relPath), 'utf8');
}

describe('L#NN-50 tripwire -- no-forgeDebug-rethrow rollout guard (issue #5512)', () => {
  it('migrated files import withDbErrorLogging', () => {
    for (const entry of MIGRATED_FILES) {
      const content = readSourceFile(entry.path);
      // Flexible import check: relative path varies by file depth
      expect(content, `${entry.path} should import withDbErrorLogging`).toMatch(
        /from\s+['"][^'"]*database\/error-logging['"]/,
      );
      expect(content, `${entry.path} should use withDbErrorLogging identifier`).toContain(
        'withDbErrorLogging',
      );
    }
  });

  it('migrated files have ZERO try/catch+forgeDebug+rethrow blocks', () => {
    for (const entry of MIGRATED_FILES) {
      const content = readSourceFile(entry.path);
      const rethrowCount = countOccurrences(content, FORGE_DEBUG_RETHROW_PATTERN);
      expect(
        rethrowCount,
        `${entry.path} has ${rethrowCount} forgeDebug+rethrow block(s), expected ${entry.expectedForgeDebugRethrow}`,
      ).toBe(entry.expectedForgeDebugRethrow);
    }
  });

  it('migrated files use withDbErrorLogging at least the expected count', () => {
    for (const entry of MIGRATED_FILES) {
      const content = readSourceFile(entry.path);
      // Count withDbErrorLogging CALLS (excluding the import line)
      const importFree = content.replace(/^import.*withDbErrorLogging.*$/gm, '');
      // Match withDbErrorLogging( as a function call (not identifier in comment)
      const usageCount = (importFree.match(/withDbErrorLogging\s*\(/g) || []).length;
      expect(
        usageCount,
        `${entry.path} has ${usageCount} withDbErrorLogging call(s), expected >= ${entry.expectedWithDbUsage}`,
      ).toBeGreaterThanOrEqual(entry.expectedWithDbUsage);
    }
  });
});
