/**
 * L#NN-50 tripwire test — no-forgeDebug-rethrow rollout guard (issue #5512).
 *
 * Purpose: Prevent regression of the forgeDebug+rethrow → withDbErrorLogging
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
 * Migrated files (cumulative):
 * - apps/forge/src/agents/agent-loader-data.ts — 2 try/catch blocks (Day 18, #5811, Kaelen)
 * - apps/forge/src/system-integrations/store.ts — 7 try/catch blocks (Day 19, #5830, Kaelen)
 * - apps/forge/src/system-settings/store.ts — 1 try/catch block (Day 20, #5825 PR2, Varek)
 * - apps/forge/src/llm/settings-store.ts — 5 try/catch blocks (Day 20, #5825 PR1, Kaelen)
 * - apps/forge/src/capabilities/store.ts — 8 try/catch blocks (Day 20, #5825 PR3, Varek)
 *
 * Candidate files (forgeDebug+rethrow pattern detected, NOT yet migrated):
 * - 56 files across apps/forge/src/ — see CANDIDATE_FILES below
 * - Tracked for future rollout PRs (scope-boundary: NOT fixed in this PR)
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
 * Numbers verified at Day 18 11:00Z.
 */
const MIGRATED_FILES: FileMigration[] = [
  {
    path: 'agents/agent-loader-data.ts',
    expectedForgeDebugRethrow: 0,
    expectedWithDbUsage: 2,
  },
  {
    path: 'system-integrations/store.ts',
    expectedForgeDebugRethrow: 0,
    expectedWithDbUsage: 7,
  },
  {
    path: 'system-settings/store.ts',
    expectedForgeDebugRethrow: 0,
    expectedWithDbUsage: 1,
  },
  {
    path: 'llm/settings-store.ts',
    expectedForgeDebugRethrow: 0,
    expectedWithDbUsage: 5,
  },
  {
    path: 'capabilities/store.ts',
    expectedForgeDebugRethrow: 0,
    expectedWithDbUsage: 8,
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

describe('L#NN-50 tripwire — no-forgeDebug-rethrow rollout guard (issue #5512)', () => {
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
        `${entry.path} has ${rethrowCount} try/catch+forgeDebug+rethrow block(s) (expected 0)`,
      ).toBe(entry.expectedForgeDebugRethrow);
    }
  });

  it('migrated files use withDbErrorLogging at least N times', () => {
    for (const entry of MIGRATED_FILES) {
      const content = readSourceFile(entry.path);
      const usageCount = countOccurrences(content, /withDbErrorLogging\s*\(/g);
      expect(
        usageCount,
        `${entry.path} has ${usageCount} withDbErrorLogging call(s) (expected >= ${entry.expectedWithDbUsage})`,
      ).toBeGreaterThanOrEqual(entry.expectedWithDbUsage);
    }
  });
});

describe('L#NN-50 tripwire — candidate file detection (issue #5512 backlog)', () => {
  /**
   * Walks apps/forge/src/ (excluding tests) and detects files with the
   * forgeDebug+rethrow pattern. These are candidates for future migration
   * PRs (scope-boundary: NOT fixed in this PR).
   *
   * The list is large (56 files at Day 18) and grows as more code is
   * added. The test verifies that the tripwire machinery itself works,
   * not that the candidate count is bounded.
   */
  it('tripwire machinery detects candidate files (sanity check)', () => {
    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          out.push(...walk(full));
        } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
          out.push(full);
        }
      }
      return out;
    }

    const allTsFiles = walk(FORGE_SRC);
    const candidateFiles: string[] = [];

    for (const file of allTsFiles) {
      const content = readFileSync(file, 'utf8');
      const rethrowCount = countOccurrences(content, FORGE_DEBUG_RETHROW_PATTERN);
      if (rethrowCount > 0) {
        candidateFiles.push(file.replace(FORGE_SRC + '/', ''));
      }
    }

    // Sanity: we expect MANY candidates (backlog for future migrations)
    // This is a positive signal that the pattern is widespread and
    // the tripwire is identifying real work.
    expect(candidateFiles.length).toBeGreaterThan(0);

    // Sanity: migrated file should NOT appear in candidates (it's been refactored)
    for (const entry of MIGRATED_FILES) {
      expect(candidateFiles, `${entry.path} should NOT appear in candidates`).not.toContain(
        entry.path,
      );
    }
  });
});
