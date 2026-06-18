/**
 * L#NN-50 tripwire (regression for #5598): _split/*.ts files must NOT use
 * the redundant `=== null || === undefined` pattern. Use `!x` (or
 * `x == null` for explicit null+undefined match) instead. The type system
 * already documents the value as nullable; the double check is noise.
 *
 * Pattern 3b (Day 3+ taxonomy) — same root cause as DRY + Type lies:
 *   x === null || x === undefined  ===  !x
 *   x !== null && x !== undefined  ===  !!x
 *
 * Tripwire: scan all admin/routes/agents/_split/*.ts files (excluding test
 * and tripwire files) for the `=== null || === undefined` anti-pattern.
 * If found, fail with file path and line.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SPLIT_DIR = join(__dirname);

function findSplitFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith('__'))
    .map((f) => join(dir, f))
    .filter((full) => statSync(full).isFile());
}

/**
 * Find lines matching the redundant `=== null || === undefined` pattern.
 * Returns 1-indexed line numbers. Detects both `x === null || x === undefined`
 * and `x !== null && x !== undefined` (the negations are equally redundant).
 */
function findRedundantNullUndefinedCheck(src: string): number[] {
  const lines = src.split('\n');
  const violations: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (
      /\S+\s*===\s*null\s*\|\|\s*\S+\s*===\s*undefined/.test(lines[i]) ||
      /\S+\s*!==\s*null\s*&&\s*\S+\s*!==\s*undefined/.test(lines[i])
    ) {
      violations.push(i + 1);
    }
  }
  return violations;
}

describe('no redundant null/undefined check in _split/ (regression for #5598 Pattern 3b)', () => {
  const files = findSplitFiles(SPLIT_DIR);

  it('_split/ contains 7 non-test source files (sanity)', () => {
    expect(files).toHaveLength(7);
  });

  for (const filepath of files) {
    const filename = filepath.split('/').pop() ?? filepath;
    it(filename + ' must use !x (or x == null) instead of x === null || x === undefined', () => {
      const src = readFileSync(filepath, 'utf8');
      const violations = findRedundantNullUndefinedCheck(src);
      expect(
        violations,
        'Found redundant null/undefined check in ' +
          filename +
          ' at line(s): ' +
          violations.join(', ') +
          '. Use !x (or x == null) instead.',
      ).toEqual([]);
    });
  }
});
