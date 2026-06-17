/**
 * L#NN-50 tripwire — findOrThrow rollout guard (issue #5469).
 *
 * Purpose: Prevent regression of the findOrThrow helper migration.
 * After a file is migrated to use findOrThrow, this tripwire ensures the
 * manual "findFirst + check undefined + forgeDebug + throw" pattern does
 * not creep back in.
 *
 * Pattern detection:
 * - Migrated file MUST import findOrThrow from ../database/find-or-throw
 * - Migrated file MUST use findOrThrow at least N times (replaces manual pattern)
 * - Migrated file MUST have FEWER manual "findFirst + check undefined" patterns
 * - Migrated file MUST have consistent error logging (no missing forgeDebug drift)
 *
 * Migrated files (issue #5469, Day 17):
 * - apps/forge/src/capabilities/runtime.ts — 5 sites (Phase 1, Day 17 #5469)
 * - apps/forge/src/agents/agent-contract-store.ts — 1 site (Phase 2, getUsagePricing profile)
 *
 * Remaining files (issue #5469 backlog, 34+ sites in 18+ files):
 * - communication/internal-chat-groups.ts (5 sites)
 * - finance/company-payables.ts (4 sites)
 * - communication/internal-chat-account-ops.ts (3 sites)
 * - ... (15+ more files with 1-2 each)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const FORGE_SRC = join(import.meta.dirname, '..');

interface FileMigration {
  path: string;
  expectedFindOrThrowUsage: number; // minimum findOrThrow call sites
  manualFindOrThrowRemaining: number; // manual findFirst + check undefined sites (target: 0)
  expectedConsistency: number; // consistency gap = manual sites WITHOUT forgeDebug (target: 0)
}

const MIGRATED_FILES: FileMigration[] = [
  {
    path: 'capabilities/runtime.ts',
    expectedFindOrThrowUsage: 5, // 5 throw-style sites migrated (Phase 1, #5469 Day 17)
    manualFindOrThrowRemaining: 1, // 1 return-style site (provider, line 280) — different pattern
    expectedConsistency: 0, // no missing forgeDebug drift
  },
  {
    path: 'agents/agent-contract-store.ts',
    expectedFindOrThrowUsage: 1, // 1 throw-style site migrated (getUsagePricing profile, Phase 2)
    manualFindOrThrowRemaining: 0, // 0 remaining throw-style sites (4 other findFirst are return-style)
    expectedConsistency: 0, // no missing forgeDebug drift
  },
];

function countOccurrences(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Detect the manual "findFirst + check undefined + throw" pattern.
 * Each pattern: a findFirst call followed within ~10 lines by
 * `if (X === undefined) ... throw new Error`.
 */
function countManualFindOrThrow(content: string): number {
  // Simple heuristic: count `=== undefined` checks followed by throw within proximity.
  // More precise: count `findFirst` calls where the next ~10 lines contain `throw new Error`.
  const lines = content.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('.findFirst(')) {
      // Look ahead ~15 lines for the throw
      const lookahead = lines.slice(i, i + 15).join('\n');
      if (lookahead.includes('throw new Error') && lookahead.includes('=== undefined')) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Count manual find-or-throw sites that DO NOT include forgeDebug (consistency gap).
 */
function countConsistencyGap(content: string): number {
  const lines = content.split('\n');
  let count = 0;
  let inFindOrThrow = false;
  let hasForgeDebug = false;
  let hasThrow = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('.findFirst(')) {
      inFindOrThrow = true;
      hasForgeDebug = false;
      hasThrow = false;
    }
    if (inFindOrThrow) {
      if (line.includes('forgeDebug')) hasForgeDebug = true;
      if (line.includes('throw new Error')) hasThrow = true;
      // End of block: closing brace at start of line
      if (line.match(/^\s*\}/) && hasThrow) {
        if (!hasForgeDebug) count++;
        inFindOrThrow = false;
      }
    }
  }
  return count;
}

describe('L#NN-50 tripwire — findOrThrow rollout guard (issue #5469)', () => {
  it('migrated files import findOrThrow (flexible path)', () => {
    for (const entry of MIGRATED_FILES) {
      const fullPath = join(FORGE_SRC, entry.path);
      const content = readFileSync(fullPath, 'utf8');
      expect(content).toMatch(/from ['"]\.\.?\/.*database\/find-or-throw['"]/);
      expect(content).toContain('findOrThrow');
    }
  });

  it('migrated files use findOrThrow at least N times', () => {
    for (const entry of MIGRATED_FILES) {
      const fullPath = join(FORGE_SRC, entry.path);
      const content = readFileSync(fullPath, 'utf8');
      const usageCount = countOccurrences(content, /findOrThrow\(/g);
      expect(
        usageCount,
        `${entry.path} has too few findOrThrow calls`,
      ).toBeGreaterThanOrEqual(entry.expectedFindOrThrowUsage);
    }
  });

  it('migrated files have at most N manual find-or-throw sites remaining', () => {
    for (const entry of MIGRATED_FILES) {
      const fullPath = join(FORGE_SRC, entry.path);
      const content = readFileSync(fullPath, 'utf8');
      const manualCount = countManualFindOrThrow(content);
      expect(
        manualCount,
        `${entry.path} has too many manual find-or-throw sites (${manualCount} > ${entry.manualFindOrThrowRemaining})`,
      ).toBeLessThanOrEqual(entry.manualFindOrThrowRemaining);
    }
  });

  it('migrated files have no consistency gap (no missing forgeDebug drift)', () => {
    for (const entry of MIGRATED_FILES) {
      const fullPath = join(FORGE_SRC, entry.path);
      const content = readFileSync(fullPath, 'utf8');
      const gapCount = countConsistencyGap(content);
      expect(
        gapCount,
        `${entry.path} has consistency gap (${gapCount} manual sites missing forgeDebug)`,
      ).toBeLessThanOrEqual(entry.expectedConsistency);
    }
  });

  it('helper file exists with correct exports', () => {
    const helperPath = join(FORGE_SRC, 'database/find-or-throw.ts');
    const content = readFileSync(helperPath, 'utf8');
    expect(content).toContain('export async function findOrThrow');
    expect(content).toContain('export interface FindOrThrowLogger');
  });
});