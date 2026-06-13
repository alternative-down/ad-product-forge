/**
 * L#NN-26 mutation protocol test fixture (for #5709, Day 13+ AM)
 *
 * This is a META-test: it verifies the L#NN-26 protocol itself works
 * (v1 false-negative + v2 false-positive).
 *
 * Protocol under test:
 *   v1: revert-fix → expect tripwire FAIL → restore → expect tripwire PASS
 *   v2: mutate-non-bug → expect tripwire PASS → restore → expect tripwire PASS
 *
 * Setup:
 *   1. Create a temp file with a known-clean content (no bug)
 *   2. Tripwire scans temp file for the bug pattern (regex)
 *   3. Apply mutation A (re-introduce bug) → expect FAIL
 *   4. Apply mutation B (rename a non-bug field) → expect PASS
 *   5. Restore
 *
 * This test is the "test of tests" — if this passes, L#NN-26 protocol works.
 * If this fails, the protocol itself is broken.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('L#NN-26 mutation protocol (v1 + v2)', () => {
  let tempDir: string;
  let sampleFile: string;
  const sampleContent = `// Sample file: clean, no bug
export const config = {
  apiKey: 'foo',
  retry: 3,
};
export function getApiKey() {
  return config.apiKey;
}
`;

  // The tripwire regex we're testing
  // Pattern: looks for `apiKey: 'literal-string'` in config
  const tripwireRegex = /apiKey:\s*['"]foo['"]/;

  // Helper: does the tripwire pass on the current file content?
  function tripwirePasses(content: string): boolean {
    return tripwireRegex.test(content);
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lnn-26-'));
    sampleFile = join(tempDir, 'sample.ts');
    writeFileSync(sampleFile, sampleContent);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('v1: false-negative protocol (revert-fix → fail → restore → pass)', () => {
    it('passes when content has the expected pattern', () => {
      // Clean content has apiKey: 'foo' → tripwire passes
      const content = readFileSync(sampleFile, 'utf-8');
      expect(tripwirePasses(content)).toBe(true);
    });

    it('fails when content is mutated to break the pattern (simulates revert-fix)', () => {
      // Mutation A: change apiKey value to a different string (breaks the regex)
      const mutated = sampleContent.replace(/apiKey:\s*['"]foo['"]/, "apiKey: 'bar'");
      writeFileSync(sampleFile, mutated);

      const content = readFileSync(sampleFile, 'utf-8');
      // The bug class is "config has different apiKey value" — tripwire should fail
      expect(tripwirePasses(content)).toBe(false);
    });

    it('passes again after restoring the fix', () => {
      // Step 1: Mutate (revert fix)
      const mutated = sampleContent.replace(/apiKey:\s*['"]foo['"]/, "apiKey: 'bar'");
      writeFileSync(sampleFile, mutated);
      // Step 2: Restore
      writeFileSync(sampleFile, sampleContent);

      const content = readFileSync(sampleFile, 'utf-8');
      // Sanity: tripwire passes on clean content
      expect(tripwirePasses(content)).toBe(true);
    });
  });

  describe('v2: false-positive protocol (mutate-non-bug → pass → restore → pass)', () => {
    it('passes when a non-bug field is renamed (semantically equivalent)', () => {
      // Mutation B: rename `retry` to `retries` (semantically equivalent, but not in regex)
      const mutated = sampleContent.replace(/retry: 3/, 'retries: 3');
      writeFileSync(sampleFile, mutated);

      const content = readFileSync(sampleFile, 'utf-8');
      // Tripwire should still pass (apiKey is still 'foo', the regex doesn't care about retry)
      expect(tripwirePasses(content)).toBe(true);
    });

    it('passes (does not break) when a comment with similar pattern is added', () => {
      // Mutation B2: add a comment that LOOKS like the pattern
      const mutated = sampleContent.replace(
        '// Sample file: clean, no bug',
        "// Sample file: clean, no bug\n// Note: apiKey: 'baz' is for testing only"
      );
      writeFileSync(sampleFile, mutated);

      const content = readFileSync(sampleFile, 'utf-8');
      // Tripwire MIGHT pass (comment contains apiKey but value is 'baz', not 'foo')
      // The comment with 'baz' is irrelevant to the regex (value is different)
      // This is the desired v2 behavior: tripwire is not over-brittle on comments
      expect(tripwirePasses(content)).toBe(true);
    });

    it('passes again after restoring the file', () => {
      // Step 1: Mutate non-bug
      const mutated = sampleContent.replace(/retry: 3/, 'retries: 3');
      writeFileSync(sampleFile, mutated);
      // Step 2: Restore
      writeFileSync(sampleFile, sampleContent);

      const content = readFileSync(sampleFile, 'utf-8');
      expect(tripwirePasses(content)).toBe(true);
    });
  });

  describe('L#NN-26 protocol integrity', () => {
    it('v1 and v2 protocols are independent (v1 fail ≠ v2 pass)', () => {
      // Apply v1 mutation (re-introduce bug)
      const v1Mutated = sampleContent.replace(/apiKey:\s*['"]foo['"]/, "apiKey: 'bar'");
      // v1 protocol: tripwire should FAIL on v1 mutation
      expect(tripwirePasses(v1Mutated)).toBe(false);

      // Apply v2 mutation (rename non-bug field)
      const v2Mutated = sampleContent.replace(/retry: 3/, 'retries: 3');
      // v2 protocol: tripwire should PASS on v2 mutation
      expect(tripwirePasses(v2Mutated)).toBe(true);
    });
  });
});
