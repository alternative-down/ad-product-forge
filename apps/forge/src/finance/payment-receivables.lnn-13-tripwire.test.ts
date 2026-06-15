/**
 * L#NN-13 Source-Level Tripwire for payment-receivables.ts (#5637).
 *
 * INVARIANT: The function `upsertProvider` MUST be a true upsert — it must
 * contain BOTH a SELECT (to find existing) AND an UPDATE (to modify the
 * existing row). The pre-#5637 code only did find-or-insert, so callers
 * rotating apiKeyEncrypted or toggling isActive saw their changes silently
 * dropped — a L#19 risk (stale API key = potential security incident).
 *
 * ENFORCEMENT: Read the source file as text, extract the upsertProvider
 * function body, STRIP COMMENTS (so commented-out lines don't false-positive
 * the regex), then assert:
 *   1. The function `upsertProvider` exists.
 *   2. The function body contains `.select(` (find existing row).
 *   3. The function body contains `.update(paymentProviders)` (L#19 fix).
 *   4. The function body contains `.set(` (the UPDATE actually sets values).
 *   5. The function body contains `db.insert(paymentProviders)` (the
 *      original INSERT path is preserved).
 *
 * L#NN-26 v1 mutation sanity (L#NN-13 13a tripwire-construction protocol):
 *   - Apply the tripwire to a source where `.update(paymentProviders)` is
 *     commented out (simulating a regression). The tripwire MUST fail.
 *   - This catches TAUTOLOGICAL tripwires that match commented-out lines
 *     (the bug Veritas caught on 2026-06-15 review of PR #5748).
 *   - Test #9 below is the L#NN-26 v1 mandatory mutation check.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_PATH = resolve(__dirname, './payment-receivables.ts');
const source = readFileSync(SOURCE_PATH, 'utf8');

// Helper: strip comments so regex assertions don't match commented-out code.
// Without this, the tripwire is TAUTOLOGICAL: a line like
//   // .update(paymentProviders)
// would satisfy `expect(fnBody).toMatch(/\.update\(paymentProviders\)/)`
// even when the actual code is broken. Veritas caught this on PR #5748.
function stripComments(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')  // strip /* ... */ block comments
    .replace(/\/\/.*$/gm, '');          // strip // ... line comments
}

// Extract the upsertProvider function body. The function ends at the
// first `  }` (2-space indented closing brace) that closes the function.
const fnMatch = source.match(/async function upsertProvider[\s\S]*?\n {2}\}\n/);
const fnBodyRaw = fnMatch ? fnMatch[0] : '';
const fnBody = stripComments(fnBodyRaw);

describe('payment-receivables.ts L#NN-13 tripwire: upsertProvider true-upsert invariant', () => {
  it('source file is readable', () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it('upsertProvider function is defined in the file', () => {
    expect(source).toMatch(/async function upsertProvider\s*\(/);
  });

  it('upsertProvider function body could be extracted', () => {
    expect(fnBodyRaw.length).toBeGreaterThan(0);
  });

  it('upsertProvider body (comments stripped) contains .select( — find existing row', () => {
    expect(fnBody).toMatch(/\.select\(/);
  });

  it('upsertProvider body (comments stripped) contains .update(paymentProviders) — L#19 fix #5637', () => {
    // The CORE invariant: the function MUST update the existing row. The
    // pre-#5637 code did NOT have this — it returned the existing id
    // without calling .update(), silently dropping caller changes.
    // NOTE: assertions operate on fnBody (with comments stripped) so that
    // commented-out `.update(paymentProviders)` lines don't false-positive.
    expect(fnBody).toMatch(/\.update\(paymentProviders\)/);
  });

  it('upsertProvider body (comments stripped) contains .set( — UPDATE actually sets values', () => {
    expect(fnBody).toMatch(/\.set\(\{/);
  });

  it('upsertProvider body (comments stripped) preserves the original INSERT path', () => {
    expect(fnBody).toMatch(/db\.insert\(paymentProviders\)/);
  });

  it('upsertProvider body (comments stripped) has BOTH .update() and .insert() branches', () => {
    const hasUpdate = /\.update\(paymentProviders\)/.test(fnBody);
    const hasInsert = /db\.insert\(paymentProviders\)/.test(fnBody);
    expect(hasUpdate).toBe(true);
    expect(hasInsert).toBe(true);
  });

  // L#NN-26 v1 mandatory mutation test (L#NN-13 13a tripwire-construction protocol).
  // This test proves the tripwire is NON-TAUTOLOGICAL: if a regression comments
  // out the `.update(paymentProviders)` line, the tripwire MUST fail. Without
  // comment-stripping, the regex would still match the commented-out line and
  // the tripwire would falsely pass. Veritas caught this tautology on PR #5748.
  it('L#NN-26 v1 mutation: tripwire FAILS when .update(paymentProviders) is commented out (non-tautological)', () => {
    // Simulate a regression by commenting out the .update() call
    const mutatedSource = source.replace(
      /\.update\(paymentProviders\)/,
      '// .update(paymentProviders)',
    );
    // Sanity: the mutation was actually applied (comment line is now present)
    expect(mutatedSource).toContain('// .update(paymentProviders)');
    // Re-extract the function body from the mutated source
    const mutatedMatch = mutatedSource.match(/async function upsertProvider[\s\S]*?\n {2}\}\n/);
    const mutatedBodyRaw = mutatedMatch ? mutatedMatch[0] : '';
    const mutatedBody = stripComments(mutatedBodyRaw);
    // The tripwire MUST now FAIL on the mutated body: the regex should NOT
    // match (because the only occurrence of .update(paymentProviders) was
    // stripped as a comment). If this assertion fails, the tripwire is
    // tautological and the L#NN-13 13a bug has returned.
    expect(mutatedBody).not.toMatch(/\.update\(paymentProviders\)/);
  });
});
