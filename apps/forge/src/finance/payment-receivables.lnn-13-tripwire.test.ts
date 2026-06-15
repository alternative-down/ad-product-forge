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
 * function body, then assert:
 *   1. The function `upsertProvider` exists.
 *   2. The function body contains `.select(` (find existing row).
 *   3. The function body contains `.update(paymentProviders)` (L#19 fix).
 *   4. The function body contains `.set(` (the UPDATE actually sets values).
 *   5. The function body contains `db.insert(paymentProviders)` (the
 *      original INSERT path is preserved).
 *
 * L#26 verification: this file is the tripwire that the L#NN-13 protocol
 * requires. Without it, a future refactor could revert upsertProvider to
 * find-or-insert and silently re-introduce the L#19 risk.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_PATH = resolve(__dirname, './payment-receivables.ts');
const source = readFileSync(SOURCE_PATH, 'utf8');

// Extract the upsertProvider function body. The function ends at the
// first `  }` (2-space indented closing brace) that is NOT inside a
// nested block. We use a simple regex: from `async function upsertProvider`
// to `  }` followed by a blank line.
const fnMatch = source.match(/async function upsertProvider[\s\S]*?\n {2}\}\n/);
const fnBody = fnMatch ? fnMatch[0] : '';

describe('payment-receivables.ts L#NN-13 tripwire: upsertProvider true-upsert invariant', () => {
  it('source file is readable', () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it('upsertProvider function is defined in the file', () => {
    expect(source).toMatch(/async function upsertProvider\s*\(/);
  });

  it('upsertProvider function body could be extracted', () => {
    expect(fnBody.length).toBeGreaterThan(0);
  });

  it('upsertProvider body contains .select( — find existing row', () => {
    expect(fnBody).toMatch(/\.select\(/);
  });

  it('upsertProvider body contains .update(paymentProviders) — L#19 fix #5637', () => {
    // This is the core invariant: the function MUST update the existing row.
    // The pre-#5637 code did NOT have this — it returned the existing id
    // without calling .update(), silently dropping caller changes.
    expect(fnBody).toMatch(/\.update\(paymentProviders\)/);
  });

  it('upsertProvider body contains .set( — UPDATE actually sets values', () => {
    expect(fnBody).toMatch(/\.set\(\{/);
  });

  it('upsertProvider body preserves the original INSERT path', () => {
    expect(fnBody).toMatch(/db\.insert\(paymentProviders\)/);
  });

  it('upsertProvider body has BOTH .update() and .insert() branches (true upsert, not find-or-insert)', () => {
    const hasUpdate = /\.update\(paymentProviders\)/.test(fnBody);
    const hasInsert = /db\.insert\(paymentProviders\)/.test(fnBody);
    expect(hasUpdate).toBe(true);
    expect(hasInsert).toBe(true);
  });
});
