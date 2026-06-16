/**
 * L#NN-19 tripwire (L#NN-13 13a 2-axis compliant) — top-up-agent-contract.ts
 *
 * Closes part of #5739 (Lead 8b — top-up-agent-contract.ts subset).
 *
 * Why this tripwire exists:
 *
 *   The original `topUpActiveAgentContract` function had 4 defensive type
 *   anti-patterns:
 *     1. `let activeContract: any = null;` — type `any` bypasses TSC
 *     2. `})) as any;` — `as any` cast on Drizzle's findFirst result
 *     3. `activeContract!.id` x3 — `!` non-null assertion inside an
 *        async-callback scope (TSC narrowing does NOT cross closure
 *        boundaries, so the assertion was needed despite the earlier
 *        `if (activeContract === null || activeContract === undefined) throw`.
 *     4. `(tx: any) =>` — `any` on the transaction callback parameter
 *        (preserved — would require a separate refactor of the
 *        db.transaction signature; out of scope for this fix)
 *
 *   The fix replaced items 1-3 with:
 *     - `let activeContract: AgentExecutionContract | null = null;`
 *     - `})) ?? null;` (coalesce undefined to null)
 *     - `const contract = activeContract;` (scope-independent narrowing)
 *     - `contract.id` / `contract.budgetUsd` (no `!` needed)
 *
 *   This tripwire catches REGRESSIONS of items 1-3.
 *
 * L#NN-13 13a 2-axis compliance (Day 15 catch patterns):
 *
 *   1. **stripComments()**: source text has block (`/* ... *\/`) and line
 *      (`//`) comments stripped before regex application. A tautological
 *      tripwire would match commented-out `as any` and pass on buggy code.
 *
 *   2. **L#NN-26 v1 mutation validator** (test #6): we simulate a reversion
 *      of the fix and confirm the tripwire's regex DOES match the buggy
 *      form, then we restore. This proves the tripwire is not tautological.
 *
 *   3. **L#NN-26 v2 false-positive check** (test #7): we add a benign
 *      comment line referencing `as any` in an UNRELATED context, and
 *      confirm that stripComments() removes it. This proves the tripwire
 *      is not over-strict.
 *
 *   4. **Header doc**: this JSDoc block documents the bug class, the
 *      fix, and the L#NN-13 13a compliance proof.
 *
 *   5. **FAIL case assertion** (test #8): we explicitly assert that the
 *      tripwire's regex would catch a known-bad pattern.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TARGET_FILE = join(__dirname, 'top-up-agent-contract.ts');

/**
 * Strip block and line comments from source text. This is the
 * L#NN-13 13a stripComments() helper — MANDATORY for any
 * source-level regex tripwire to avoid false-positives on
 * commented-out code.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^\s*\/\/.*$/gm, '')      // line comments at start
    .replace(/\s+\/\/.*$/gm, '');      // line comments after code
}

describe('L#NN-19 tripwire — top-up-agent-contract.ts type-safety (Lead 8b, #5739)', () => {
  const raw = readFileSync(TARGET_FILE, 'utf8');
  const src = stripComments(raw);

  it('test #1: activeContract must NOT be typed as `any`', () => {
    // The original bug: `let activeContract: any = null;`
    // The fix: `let activeContract: AgentExecutionContract | null = null;`
    expect(src).not.toMatch(/let\s+activeContract\s*:\s*any\s*=/);
  });

  it('test #2: topUpActiveAgentContract must NOT have `as any` cast on findFirst result', () => {
    // The original bug: `})) as any;`
    // The fix: `})) ?? null;` (coalesce undefined to null)
    expect(src).not.toMatch(/\}\)\)\s+as\s+any\s*;/);
  });

  it('test #3: function body must NOT have `activeContract!` non-null assertion', () => {
    // The original bug: 3× `activeContract!.id` and `activeContract!.budgetUsd`
    // The fix: assign `const contract = activeContract;` after null check, use `contract.x`
    expect(src).not.toMatch(/activeContract\s*!\s*\./);
  });

  it('test #4: function must have a const-narrowed reference after the null check', () => {
    // The fix pattern: after the throw, declare `const contract = activeContract;`
    // This is what allows the async-callback scope to use `contract.x` without `!`.
    // We check for the pattern structurally (L#NN-13 13a) without coupling to
    // the exact variable name (in case future agents rename).
    expect(src).toMatch(/const\s+\w+\s*=\s*activeContract\s*;/);
  });

  it('test #5: function body must not regress to a global `: any` type alias for the local', () => {
    // Defense-in-depth: even if test #1 is bypassed by an inline `: any`
    // annotation, the function should not have a top-level `any` on
    // the local activeContract variable.
    const lines = src.split('\n');
    const suspect = lines.filter((l) => /activeContract\s*:\s*any/.test(l));
    expect(suspect).toEqual([]);
  });

  it('test #6 (L#NN-26 v1 mutation validator): tripwire is NOT tautological', () => {
    // Prove the regex is not just "match nothing".
    // If we REINTRODUCE the bug, the tripwire's regex MUST match.
    const buggySrc = src.replace(
      /let\s+activeContract\s*:\s*AgentExecutionContract\s*\|\s*null\s*=/,
      'let activeContract: any =',
    );
    // Buggy source has `let activeContract: any = ...` — regex must match
    expect(buggySrc).toMatch(/let\s+activeContract\s*:\s*any\s*=/);
  });

  it('test #7 (L#NN-26 v2 false-positive): stripComments removes line comments', () => {
    // The stripComments helper must remove a line containing the patterns
    // the tripwire checks. This is what prevents false-positives on
    // commented-out buggy code.
    const withComment = 'const x = 1;\n// let activeContract: any = null;\nconst y = 2;';
    const stripped = stripComments(withComment);
    expect(stripped).not.toMatch(/activeContract\s*:\s*any/);
    expect(stripped).toContain('const x = 1;');
    expect(stripped).toContain('const y = 2;');
  });

  it('test #8 (FAIL case assertion): the regex pattern actually catches the bug', () => {
    // Sanity check that the regex we use is syntactically correct and
    // would catch a known-bad input.
    const knownBad = 'let activeContract: any = null;';
    const knownGood = 'let activeContract: AgentExecutionContract | null = null;';
    const regex = /let\s+activeContract\s*:\s*any\s*=/;
    expect(regex.test(knownBad)).toBe(true);
    expect(regex.test(knownGood)).toBe(false);
  });
});
