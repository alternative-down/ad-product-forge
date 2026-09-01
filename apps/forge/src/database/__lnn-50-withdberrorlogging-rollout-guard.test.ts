/**
 * L#NN-50 tripwire test — withDbErrorLogging rollout guard (issue #5468).
 *
 * Purpose: Prevent regression of the withDbErrorLogging helper migration.
 * After a store file is migrated to use withDbErrorLogging, this tripwire
 * ensures the manual try/catch pattern does not creep back in.
 *
 * Pattern detection:
 * - Migrated file MUST import withDbErrorLogging from ../database/error-logging
 * - Migrated file MUST have FEWER try/catch blocks than the baseline
 * - Migrated file MUST use withDbErrorLogging at least once for DB operations
 *
 * Migrated files (issue #5468, Day 17):
 * - apps/forge/src/webhooks/store.ts — 9 try/catch blocks (PR #5483)
 * - apps/forge/src/schedules/manager/store.ts — partial (Phase 2, Day 16)
 * - apps/forge/src/notifications/store.ts — 3/4 try/catch blocks (Phase 1, Day 17 #5468)
 *
 * Format B sites (manual forgeDebug + inline errorMsg) are also detected and
 * counted. After migration, the count should match the documented allowlist.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const FORGE_SRC = join(import.meta.dirname, '..');

interface StoreFileMigration {
  path: string;
  expectedTryCatch: number; // remaining manual try/catch blocks (target: as low as possible)
  expectedWithDbUsage: number; // minimum withDbErrorLogging call sites
  formatBAllowlist: number; // allowed Format B sites (with documented reason)
}

/**
 * Registry of migrated store files. Update when a new file is migrated.
 * Numbers verified via re-grep at 11:15Z Day 17.
 */
const MIGRATED_STORE_FILES: StoreFileMigration[] = [
  {
    path: 'webhooks/store.ts',
    expectedTryCatch: 0,
    expectedWithDbUsage: 9,
    formatBAllowlist: 0,
  },
  {
    path: 'schedules/manager/store.ts',
    expectedTryCatch: 10, // partially migrated (Day 16 Phase 2 added 5 sites)
    expectedWithDbUsage: 5,
    formatBAllowlist: 0,
  },
  {
    path: 'notifications/store.ts',
    expectedTryCatch: 1, // markNotificationsRead kept (unique return shape)
    expectedWithDbUsage: 3, // 3 sites migrated in Day 17 #5468
    formatBAllowlist: 1, // markNotificationsRead
  },
];

function countOccurrences(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

describe('L#NN-50 tripwire — withDbErrorLogging rollout guard (issue #5468)', () => {
  it('migrated files import withDbErrorLogging', () => {
    for (const entry of MIGRATED_STORE_FILES) {
      const fullPath = join(FORGE_SRC, entry.path);
      const content = readFileSync(fullPath, 'utf8');
      // Flexible import check: relative path varies by file depth
      expect(content).toMatch(/from ['"]\.\.?\/.*database\/error-logging['"]/);
      expect(content).toContain('withDbErrorLogging');
    }
  });

  it('migrated files have expected try/catch block counts', () => {
    for (const entry of MIGRATED_STORE_FILES) {
      const fullPath = join(FORGE_SRC, entry.path);
      const content = readFileSync(fullPath, 'utf8');
      const tryCount = countOccurrences(content, /\btry\s*\{/g);
      expect(tryCount, `${entry.path} has too many try/catch blocks`).toBeLessThanOrEqual(
        entry.expectedTryCatch,
      );
    }
  });

  it('migrated files use withDbErrorLogging at least N times', () => {
    for (const entry of MIGRATED_STORE_FILES) {
      const fullPath = join(FORGE_SRC, entry.path);
      const content = readFileSync(fullPath, 'utf8');
      const usageCount = countOccurrences(content, /withDbErrorLogging\(/g);
      expect(
        usageCount,
        `${entry.path} has too few withDbErrorLogging calls`,
      ).toBeGreaterThanOrEqual(entry.expectedWithDbUsage);
    }
  });

  it('migrated files have no more Format B sites than allowed', () => {
    // Format B pattern: message: '...' + errorMsg(err) or message: `...${errorMsg(err)}...`
    const formatBRegex =
      /message:\s*['"`].*['"`]\s*\+\s*errorMsg\s*\(|message:\s*`[^`]*\$\{[^}]*errorMsg\s*\(/g;
    for (const entry of MIGRATED_STORE_FILES) {
      const fullPath = join(FORGE_SRC, entry.path);
      const content = readFileSync(fullPath, 'utf8');
      const formatBCount = countOccurrences(content, formatBRegex);
      expect(
        formatBCount,
        `${entry.path} has too many Format B sites (${formatBCount} > ${entry.formatBAllowlist})`,
      ).toBeLessThanOrEqual(entry.formatBAllowlist);
    }
  });

  it('rollout is non-regressive (total try/catch count across migrated files)', () => {
    // Aggregate guard: as more files are migrated, the total try/catch count
    // should not increase. This catches re-introductions even if a single file
    // passes its individual threshold.
    let totalTry = 0;
    for (const entry of MIGRATED_STORE_FILES) {
      const fullPath = join(FORGE_SRC, entry.path);
      const content = readFileSync(fullPath, 'utf8');
      totalTry += countOccurrences(content, /\btry\s*\{/g);
    }
    // Day 17 baseline: webhooks (0) + schedules/manager (10) + notifications (1) = 11
    expect(totalTry).toBeLessThanOrEqual(11);
  });
});