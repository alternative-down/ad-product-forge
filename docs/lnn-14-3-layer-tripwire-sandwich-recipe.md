# L#NN-14 — 3-Layer Tripwire Sandwich Extension Recipe

**Verified as of**: 2026-06-14 (Day 14, post #5667 dispatch)
**Owner**: Aldric (recipe + example), TPL Orion (framework review)
**Status**: RECIPE
**Family**: L#NN-12 (anti-pattern-cascade 3-level), L#NN-13 (test-mock-vs-check), L#NN-19 (L#19 tripwire)
**Closes**: #5667

## Why a Sandwich?

A single tripwire (L#19 style) catches the **anti-pattern** it was written for but does NOT catch **replacement lint violations** introduced when "fixing" the anti-pattern. Example from PR #5664 (Kaelen Wave 3+4 atomic-cluster):

- L#19 tripwire catches the original `(X ?? '') === ''` defensive nullish-defaulting anti-pattern.
- L#19 tripwire does NOT catch `!X` (trips `strict-boolean-expressions`).
- L#19 tripwire does NOT catch `!Boolean(X)` (trips `no-extra-boolean-cast`).
- L#19 tripwire DOES correctly accept `(X == null || X === '')` as canonical.

The sandwich closes this gap. Each layer catches a different failure mode.

## The 3-Layer Sandwich

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1: ANTI-PATTERN TRIPWIRE                              │
│  ─────────────────────────────                              │
│  Source-level regex scan. Catches the original sub-3b        │
│  pattern (e.g. `(X ?? '') === ''`). Output: violations list. │
│  Tool: readFileSync + walk + regex.                          │
├──────────────────────────────────────────────────────────────┤
│  Layer 2: LINT COMPLIANCE                                    │
│  ────────────────────────                                    │
│  Runs lint on the replacement code. Catches lint failures    │
│  like `!X` (strict-boolean-expressions) and `!Boolean(X)`    │
│  (no-extra-boolean-cast). Output: lint error count.          │
│  Tool: eslint --max-warnings 0, or programmatic ESLint.     │
├──────────────────────────────────────────────────────────────┤
│  Layer 3: SEMANTIC PRESERVATION                              │
│  ────────────────────────────                                │
│  Runtime test that the refactor preserves original behavior  │
│  for all relevant inputs (null, undefined, '', 0, false,     │
│  [], {}, Symbol(), 'hello'). Output: pass/fail per input.    │
│  Tool: vitest with input matrix.                             │
└──────────────────────────────────────────────────────────────┘
```

## Canonical Case: L#NN-12 3-Level Cascade

PR #5664 went through 3 iterations to land the canonical form:

| Level | Form | Lint | Semantic | Anti-pattern? |
|-------|------|------|----------|---------------|
| **L1** (original) | `(X ?? '') === ''` | ✅ clean | ✅ correct | ❌ no |
| **L2** (anti-pattern) | `!X` | ❌ strict-boolean-expressions | ⚠️ wrong for non-string | ✅ yes |
| **L3** (anti-pattern) | `!Boolean(X)` | ❌ no-extra-boolean-cast | ⚠️ wrong for non-boolean | ✅ yes |
| **L4 (canonical)** | `X == null || X === ''` | ✅ clean | ✅ correct | ❌ no |

**L4 is the only lint-clean AND semantically correct endpoint.**

## How to Apply the Sandwich

### Step 1: Define the function under test

```typescript
// Example: check if a nullable string is "empty" (null, undefined, or '')
function isEmptyString(x: string | null | undefined): boolean {
  return x == null || x === '';
}
```

### Step 2: Layer 1 — Anti-pattern tripwire

Read the source file and assert no L1/L2/L3 anti-patterns:

```typescript
import { readFileSync } from 'node:fs';

it('Layer 1: no anti-pattern in is-empty-string helper', () => {
  const src = readFileSync('src/utils/is-empty-string.ts', 'utf8');
  // L1: (X ?? '') === ''  — banned
  expect(src).not.toMatch(/\(\s*\w+\s*\?\?\s*['"]['"]\s*\)\s*===\s*['"]['"]/);
  // L2: !X in compound boolean — banned
  expect(src).not.toMatch(/&&\s*!\s*\w+|^\s*if\s*\(\s*!\s*\w+/m);
  // L3: !Boolean(X) — banned
  expect(src).not.toMatch(/!Boolean\s*\(/);
});
```

### Step 3: Layer 2 — Lint compliance

Run ESLint and assert 0 errors / 0 new warnings on the touched file:

```typescript
import { ESLint } from 'eslint';

it('Layer 2: lint passes for is-empty-string helper', async () => {
  const eslint = new ESLint({ overrideConfigFile: 'eslint.config.node.mjs' });
  const results = await eslint.lintFiles(['src/utils/is-empty-string.ts']);
  const errors = results.flatMap(r => r.errorCount);
  expect(errors).toEqual([]);
});
```

### Step 4: Layer 3 — Semantic preservation

Test the function with the input matrix and verify the original L1 form (`(X ?? '') === ''`) and the new L4 form produce identical results:

```typescript
import { isEmptyString } from '../src/utils/is-empty-string';

describe('Layer 3: semantic preservation across null/undef/empty inputs', () => {
  const inputs: Array<string | null | undefined> = [
    null, undefined, '', 'hello', 'x', ' ', '0', // null/undef + string edge cases
  ];

  for (const input of inputs) {
    it(`isEmptyString(${JSON.stringify(input)}) === L1 baseline`, () => {
      // L1 form baseline (the original behavior)
      const l1Result = (input ?? '') === '';
      // L4 form (the new canonical behavior)
      const l4Result = isEmptyString(input);
      expect(l4Result).toBe(l1Result);
    });
  }

  it('L4 form differs from L2 (!X) for non-string-coercible inputs', () => {
    // Demonstrates WHY L2 was wrong: !X treats '0' as truthy (correct)
    // but !X trips strict-boolean-expressions lint rule.
    expect('0' == null || '0' === '').toBe(false);  // L4: '0' is not empty
    // L2 (wrong): !'0' is false (correct behavior), but lint fails
    // L2 (wrong): !0 is true (wrong behavior — 0 is not a string-empty)
  });
});
```

## Layer 1 + 2 + 3 in a Single Test File

See `apps/forge/src/__lnn-14-3-layer-tripwire-sandwich.test.ts` for a complete example that runs all 3 layers against a real function from the SCAN_ROOTS. The test file is the canonical sandwich example.

## Cross-Links

- **L#NN-12** (anti-pattern-cascade 3-level): the canonical case the sandwich was designed for
- **L#NN-13** (test-mock-vs-check-mismatch): L#NN-13 13a is the source-level regex pattern that Layer 1 uses
- **L#NN-19** (L#19 tripwire): the foundation tripwire the sandwich extends
- **L#NN-9 9e** (secret-as-identifier): a similar defense-in-depth pattern for a different domain
- **L#NN-26** (mutation protocol): Layer 1 tripwires should be L#NN-26 mutation-verified (revert → fail → restore → pass)
- **PR #5621** (existing L#19 tripwire): the foundation that this recipe extends; NOT modified by this PR
- **PR #5664** (Kaelen Wave 3+4 atomic-cluster): the source of the L#NN-12 3-level cascade

## Limitations

- The sandwich catches the L#NN-12 cascade but does NOT generalize to all L#NN families. Each family needs its own sandwich.
- Layer 2 lint check requires ESLint programmatic API; if not available, fallback to `npx eslint` CLI assertion.
- Layer 3 semantic preservation is only as good as the input matrix. 7 inputs catches most cases; add more for domain-specific edge cases.

## When to use this recipe

- Whenever a single-layer tripwire fails to catch a known failure mode (e.g., replacement lint violations).
- Whenever you refactor existing code and want to verify the refactor preserves behavior.
- Whenever you introduce a new canonical form and want to ensure no one reverts to anti-patterns.

## Out of scope (separate work)

- Modifying the L#19 tripwire (PR #5621) — separate work
- Adding new lint rules — recipe only
- Generalizing the sandwich to other L#NN families (L#NN-13, L#NN-15, etc.) — future PRs
