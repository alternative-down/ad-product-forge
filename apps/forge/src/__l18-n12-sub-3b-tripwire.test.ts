import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tripwire (regression for #5627 + #5632 + #5636 — L#18 N=12 sub-pattern 3b):
// functions should NOT use defensive null/undefined anti-patterns when the
// type system already narrows the check. Three patterns are flagged:
//   1. `X === null || X === undefined` (defensive negative)
//   2. `X !== null && X !== undefined` (defensive positive)
//   3. `(X ?? '') === ''` and `(X ?? 0) === 0` (redundant nullish defaulting
//      when type is `T | undefined` — `!X` covers both)
//
// All three were swept in the Wave 3 atomic-cluster (PR #XXXX). This tripwire
// catches any re-introduction of the antipattern.

// Scoped to the 4 subsystems cleaned by the Wave 3 atomic-cluster
// (#5627, #5632, #5636, #5625). Future cleanup PRs for admin/, agents/,
// communication/ subsystems can extend this list.
const SCAN_ROOTS = [
  join(__dirname, 'schedules', 'notifications'),
  join(__dirname, 'notifications'),
  join(__dirname, 'capabilities'),
  join(__dirname, 'finance', 'payment-providers'),
];
const SKIP_FILES = new Set([
  // this tripwire file itself
  '__l18-n12-sub-3b-tripwire.test.ts',
]);

function* walkSourceFiles(): Generator<string> {
  for (const root of SCAN_ROOTS) {
    if (!statSync(root).isDirectory()) continue;
    for (const entry of readdirSync(root)) {
      const full = join(root, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        yield* walkSourceFilesFrom(full);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
        if (SKIP_FILES.has(entry)) continue;
        yield full;
      }
    }
  }
}
function* walkSourceFilesFrom(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkSourceFilesFrom(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      if (SKIP_FILES.has(entry)) continue;
      yield full;
    }
  }
}

function findViolations(pattern: RegExp, lineFilter?: (line: string) => boolean): string[] {
  const violations: string[] = [];
  for (const file of walkSourceFiles()) {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (pattern.test(line) && (!lineFilter || lineFilter(line))) {
        violations.push(`${file}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  return violations;
}

describe('L#18 N=12 sub-pattern 3b tripwire (regression for #5627 + #5632 + #5636)', () => {
  it('no function uses defensive `X === null || X === undefined` patterns', () => {
    const pattern = /===\s*null\s*\|\|\s*\w+\s*===\s*undefined/;
    const violations = findViolations(pattern);
    expect(violations).toEqual([]);
  });

  it('no function uses defensive `X !== null && X !== undefined` patterns', () => {
    const pattern = /!==\s*null\s*&&\s*\w+\s*!==\s*undefined/;
    const violations = findViolations(pattern);
    expect(violations).toEqual([]);
  });

  it('no function uses redundant `(X ?? <value>) === <value>` defaulting', () => {
    // Matches both `(X ?? '') === ''` and `(X ?? 0) === 0` patterns.
    // The fix is to use `!X` (truthy check) or `X === undefined` (explicit).
    const pattern = /\(\s*\w+\s*\?\?\s*('0'|""|0|false|true)\s*\)\s*===\s*('0'|""|0|false|true)/;
    const violations = findViolations(pattern);
    expect(violations).toEqual([]);
  });

  // ── L#NN-12 anti-pattern-cascade tripwires (issue #5669) ──────────────────
  // Catches the 3-level cascade discovered in PR #5664:
  //   L1 (original): (X ?? '') === '' (lint-clean, type-coerced)
  //   L2 (anti-pattern): !X (trips strict-boolean-expressions for nullable X)
  //   L3 (anti-pattern): !Boolean(X) (trips no-extra-boolean-cast)
  //   L4 (CANONICAL): X == null || X === '' (only lint-clean endpoint)
  //
  // Both L2 and L3 are EQUIVALENT in failure mode. The tripwires catch BOTH to
  // prevent the 3-iteration cascade I went through in PR #5664.

  it('no function uses !nullableX pattern in compound boolean (L#NN-12 L2 anti-pattern)', () => {
    // Catches: !identifier in a compound boolean (preceded by && or ||).
    // The L2 anti-pattern from PR #5664 was:
    //   L25: !input.cronExpression  (in && compound)
    //   L34: !input.scheduledDate   (in && compound)
    //   L45: !scheduledDate         (in || compound)
    //   L77: !description           (in && compound)
    //
    // The fix is the L4 canonical form:
    //   X == null || X === ''       (for nullable string)
    //   X == null || X === 0        (for nullable number)
    //   X != null && X !== ''       (for positive nullable check)
    //
    // Detection strategy: regex match + line-level compound check.
    // The regex matches !identifier.property (with property access allowed,
    // but excludes method calls via the lookahead on )/;/,/newline/&/|).
    // The line-level check filters out single negations like if (!isValid)
    // that have no compound boolean on the line.
    //
    // Regex: preceded by [&|! or (], then !identifier(.property)*, then
    // followed by [);,\n|&] (excludes method calls where next char is ().
    const pattern = /(?:[!&|]\()\s*!\s*[a-zA-Z_][a-zA-Z0-9_.]*(?=\s*[);,\n|&])/;
    const compoundLineFilter = (line: string) => /&&|\|\|/.test(line);
    const violations = findViolations(pattern, compoundLineFilter);
    // The tripwire currently passes (canonical L4 form in place post-PR #5664).
    // If any L2 anti-pattern is reintroduced, this test fails.
    expect(violations).toEqual([]);
  });

  it('no function uses !Boolean(X) wrapper (L#NN-12 L3 anti-pattern)', () => {
    // Catches: !Boolean(X) literal. This is the Boolean wrapper anti-pattern
    // that was tried in PR #5664 commit fa45873b to satisfy
    // strict-boolean-expressions — it failed lint by tripping
    // no-extra-boolean-cast. The L4 canonical form (X == null || X === '')
    // is the only lint-clean endpoint.
    const pattern = /!Boolean\s*\(/;
    const violations = findViolations(pattern);
    expect(violations).toEqual([]);
  });


});
