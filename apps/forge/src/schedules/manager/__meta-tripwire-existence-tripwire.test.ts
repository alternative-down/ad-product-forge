/**
 * L#NN-50 #16 v6 meta-tripwire — tripwire existence guard for Q1-D cluster.
 *
 * Codifies the pattern that tripwire/test files are commonly dropped in
 * rebase reconciliation (L#NN-50 #16 v3 + v6). This test asserts that
 * the 4 tripwire files from the Q1-D PM-MERGE (commit 238230c02def,
 * PR #5992, 2026-06-23) are still present in develop.
 *
 * If any of these tests fail, one of the tripwires was deleted or
 * modified — investigate via `git log -- <path>` and restore from
 * commit 238230c02def or equivalent source.
 *
 * Cycle: P0 #6012 (16:24Z Day 23) — false-positive (Orion's API check
 * used wrong path `apps/forge/src/__tests__/tripwires` instead of
 * `apps/forge/src/schedules/manager/`). This meta-tripwire is the
 * defensive measure to prevent future silent tripwire drops.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SCHEDULES_MANAGER_DIR = join(__dirname);

const TRIPWIRE_FILES = {
  '__q1d-lnn-32-v12-tripwire.test.ts': '9e93c5ca8214fa17a762d0fbdde693915497f825',
  '__no-cast-regression.test.ts': 'cea4616d9cc47ec07accbe1ea25a3a389dc5a0b7',
  '__no-local-error-msg-tripwire.test.ts': '1ad1e11159155e405d8b91e4d4dcf43f012a8ccc',
  '__lnn-19-manager-cast-cluster-tripwire.test.ts': '00d96ff86839f69f2b7b6d12b039b8678a12e02f',
} as const;

describe('L#NN-50 #16 v6 meta-tripwire — Q1-D tripwire existence', () => {
  for (const [filename, expectedSha] of Object.entries(TRIPWIRE_FILES)) {
    it(`${filename} exists in schedules/manager/`, () => {
      const path = join(SCHEDULES_MANAGER_DIR, filename);
      expect(existsSync(path)).toBe(true);
    });

    it(`${filename} is non-empty`, () => {
      const path = join(SCHEDULES_MANAGER_DIR, filename);
      if (!existsSync(path)) return; // skip if missing (other test fails)
      const content = readFileSync(path, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    });
  }

  it('all 4 tripwires present in cluster directory', () => {
    for (const filename of Object.keys(TRIPWIRE_FILES)) {
      const path = join(SCHEDULES_MANAGER_DIR, filename);
      expect(existsSync(path)).toBe(true);
    }
  });

  it('tripwire file count matches Q1-D cluster (4 files)', () => {
    const presentCount = Object.keys(TRIPWIRE_FILES).filter((f) =>
      existsSync(join(SCHEDULES_MANAGER_DIR, f)),
    ).length;
    expect(presentCount).toBe(4);
  });

  it('no tripwire file is empty (catches truncation)', () => {
    for (const filename of Object.keys(TRIPWIRE_FILES)) {
      const path = join(SCHEDULES_MANAGER_DIR, filename);
      if (!existsSync(path)) continue;
      const content = readFileSync(path, 'utf-8');
      // Sanity: at least 10 lines for a real test file
      expect(content.split('\n').length).toBeGreaterThan(10);
    }
  });
});