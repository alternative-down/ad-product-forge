/**
 * L#NN-50 tripwire test — tool-error-wrapper rollout guard (issue #5809).
 *
 * Purpose: Prevent regression of the withToolErrorLogging helper migration
 * for LLM-facing tool wrappers. After a file is migrated to use
 * withToolErrorLogging for its boilerplate try/catch+forgeDebug+return-{valid:false}
 * pattern, this tripwire ensures the manual pattern does not creep back in.
 *
 * Pattern detection:
 * - Migrated file MUST import withToolErrorLogging from tools/error-wrapper
 * - Migrated file MUST have ZERO try/catch+forgeDebug+return-{valid:false} blocks
 * - Migrated file MUST use withToolErrorLogging at least N times
 *
 * Migrated files (issue #5809 Phase 1, Day 18):
 * - apps/forge/src/capabilities/tools.ts — 6 tool sites (7 calls due to manage_agent_role 3 branches)
 *
 * Phase 2 candidates (github/tools.ts, 3 blocks) — NOT yet migrated, will trigger tripwire
 * Phase 3 candidates (coolify/tools.ts, 4 blocks) — NOT yet migrated, will trigger tripwire
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const FORGE_SRC = join(import.meta.dirname, '..');

interface FileMigration {
  path: string;
  expectedTryCatchReturnFalse: number; // remaining manual try/catch+{valid:false} blocks (target: 0)
  expectedWithToolErrorLoggingUsage: number; // minimum withToolErrorLogging call sites
}

/**
 * Registry of migrated files (forgeDebug+return-{valid:false} pattern eliminated).
 * Update when a new file is migrated.
 * Numbers verified at Day 18 12:38Z.
 */
const MIGRATED_FILES: FileMigration[] = [
  {
    path: 'capabilities/tools.ts',
    expectedTryCatchReturnFalse: 0,
    expectedWithToolErrorLoggingUsage: 7, // 6 tool sites; manage_agent_role has 3 action branches
  },
];

/**
 * Pattern: try { ... } catch (X) { forgeDebug({...}); return { valid: false, ... } }
 *
 * Regex matches a `catch` block containing both `forgeDebug(` and
 * `return { ... valid: false ... }` within ~500 chars.
 */
const TOOL_ERROR_RETHROW_PATTERN =
  /}\s*catch\s*\([^)]*\)\s*\{[\s\S]{0,2000}?forgeDebug\s*\([\s\S]{0,2000}?return\s*\{[^}]*valid:\s*false/g;

function countOccurrences(content: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function readSourceFile(relPath: string): string {
  return readFileSync(join(FORGE_SRC, relPath), 'utf8');
}

describe('L#NN-50 tripwire — tool-error-wrapper rollout guard (issue #5809)', () => {
  it('migrated files import withToolErrorLogging', () => {
    for (const entry of MIGRATED_FILES) {
      const content = readSourceFile(entry.path);
      expect(content, `${entry.path} should import withToolErrorLogging`).toMatch(
        /from\s+['"][^'"]*tools\/error-wrapper['"]/,
      );
      expect(content, `${entry.path} should use withToolErrorLogging identifier`).toContain(
        'withToolErrorLogging',
      );
    }
  });

  it('migrated files have ZERO try/catch+{valid:false} blocks', () => {
    for (const entry of MIGRATED_FILES) {
      const content = readSourceFile(entry.path);
      const count = countOccurrences(content, TOOL_ERROR_RETHROW_PATTERN);
      expect(
        count,
        `${entry.path} has ${count} try/catch+{valid:false} block(s) (expected 0)`,
      ).toBe(entry.expectedTryCatchReturnFalse);
    }
  });

  it('migrated files use withToolErrorLogging at least N times', () => {
    for (const entry of MIGRATED_FILES) {
      const content = readSourceFile(entry.path);
      const usageCount = countOccurrences(content, /withToolErrorLogging\s*\(/g);
      // Subtract 1 for the import statement
      const callCount = usageCount - 1;
      expect(
        callCount,
        `${entry.path} has ${callCount} withToolErrorLogging call(s) (expected >= ${entry.expectedWithToolErrorLoggingUsage})`,
      ).toBeGreaterThanOrEqual(entry.expectedWithToolErrorLoggingUsage);
    }
  });
});
