/**
 * L#NN-32 v8 tripwire — finance/ scope.
 *
 * Pre-#6015 cluster, `payment-receivables.ts` used `(db.insert(paymentProviders).values(...) as unknown as InsertBuilder)` casts to silence Drizzle's stricter-typed builder.
 * The cast masked 5 latent bugs (isActive bool→int, missing id fields, customerId required, configJson JSON-string, etc.).
 *
 * L#NN-32 v8 codification: NO `as unknown as InsertBuilder` casts in finance/ code.
 * If a future regression reintroduces this anti-pattern, this tripwire fails.
 *
 * Scope: apps/forge/src/finance/*.ts (non-test files only).
 *
 * Allowlist: NONE — the cast is an absolute prohibition in finance/ scope
 * (the pattern was deprecated and the L#NN-32 v8 sweep removed it across
 * the codebase on Day 23).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const FORGE_SRC = import.meta.dirname;

/** Recursively collect all .ts files under apps/forge/src/finance/ (non-test). */
function collectFinanceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectFinanceFiles(fullPath));
    } else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Strip comments from TS source to prevent commented-out violations from satisfying the regex. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('finance/ L#NN-32 v8 tripwire: no `as unknown as InsertBuilder` casts', () => {
  const files = collectFinanceFiles(FORGE_SRC);

  it('finds at least one finance/ file to scan (sanity check)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('NO finance/ source file contains `as unknown as InsertBuilder` cast (L#NN-32 v8 enforcement)', () => {
    const violations: Array<{ file: string; line: number; snippet: string }> = [];

    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      const stripped = stripComments(raw);
      const lines = stripped.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (/as\s+unknown\s+as\s+InsertBuilder/.test(lines[i])) {
          violations.push({ file, line: i + 1, snippet: lines[i].trim() });
        }
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  ${v.file}:${v.line}: ${v.snippet}`)
        .join('\n');
      throw new Error(
        `L#NN-32 v8 violation — ` +
          violations.length +
          ` finance/ file(s) contain \`as unknown as InsertBuilder\` cast(s):\n${message}\n\n` +
          `This pattern was deprecated Day 23. See #6014 for context. ` +
          `Use the canonical fix pattern from webhooks/store.ts:262 or notifications/store.ts:130 instead.`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});