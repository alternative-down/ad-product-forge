/**
 * L#NN-50 #23 N=4 tripwire — payment-receivables.ts scope.
 *
 * Pre-#6013 cluster, payment-receivables.ts had 4 callsites that wrote
 * `amountUsd` to `paymentTransactions` WITHOUT a corresponding `currency`
 * field. The amountUsd number was implicitly USD (broken assumption).
 *
 * L#NN-50 #23 codification: every `amountUsd:` write in payment-receivables.ts
 * must be paired with a `currency:` field in the SAME INSERT call (or as
 * input to a function that writes the row).
 *
 * Why this matters:
 * - Multi-currency support requires explicit currency tracking
 * - Implicit USD assumptions silently mis-report BRL/EUR payments
 * - L#NN-32 v8 sweep removed the `as unknown` cast that masked this bug
 *
 * Scope: apps/forge/src/finance/payment-receivables.ts only.
 * Implementation: parse insert(...).values({...}) call sites and assert
 * amountUsd and currency co-occur in the same object literal.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const TARGET_FILE = join(import.meta.dirname, 'payment-receivables.ts');

/** Strip comments to prevent commented-out violations from satisfying the regex. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('payment-receivables.ts L#NN-50 #23 tripwire: amountUsd writes must pair with currency', () => {
  const raw = readFileSync(TARGET_FILE, 'utf8');
  const stripped = stripComments(raw);

  it('file exists and is readable', () => {
    expect(raw.length).toBeGreaterThan(0);
  });

  it('every `amountUsd:` occurrence in payment-receivables.ts has a corresponding `currency:` field', () => {
    const lines = stripped.split('\n');
    const violations: Array<{ line: number; snippet: string }> = [];

    // Scope: ONLY flag amountUsd writes whose nearest preceding insert() call
    // is for paymentTransactions (not companyCashLedger, which has no currency column).
    // Heuristic: for each amountUsd: line, scan backward up to 25 lines for
    // the most recent .insert(...) call. If the most recent insert is paymentTransactions,
    // require currency: in the same object literal.

    for (let i = 0; i < lines.length; i++) {
      if (!/amountUsd\s*:/.test(lines[i])) continue;

      // Find the most recent insert() call in the previous 25 lines
      const lookbackStart = Math.max(0, i - 25);
      const lookbackWindow = lines.slice(lookbackStart, i + 1).join('\n');
      const insertMatches = [...lookbackWindow.matchAll(/\.insert\(([a-zA-Z]+)\)/g)];
      if (insertMatches.length === 0) continue;

      const lastInsertCall = insertMatches[insertMatches.length - 1][1];
      if (lastInsertCall !== 'paymentTransactions') continue;

      // We're inside a paymentTransactions insert — check for currency: in same object
      // Scan forward up to 30 lines for a closing brace, check segment before brace
      const windowEnd = Math.min(lines.length, i + 30);
      const window = lines.slice(i, windowEnd).join('\n');
      const beforeClosingBrace = window.split('}')[0];

      if (!/currency\s*:/.test(beforeClosingBrace)) {
        violations.push({
          line: i + 1,
          snippet: lines[i].trim(),
        });
      }
    }

    if (violations.length > 0) {
      const message = violations
        .map((v) => `  Line ${v.line}: ${v.snippet}`)
        .join('\n');
      throw new Error(
        `L#NN-50 #23 N=4 violation — payment-receivables.ts has ` +
          violations.length +
          ` \`amountUsd:\` write(s) without co-located \`currency:\` field:\n${message}\n\n` +
          `Every amountUsd INSERT/UPDATE in this file MUST include a currency: field. ` +
          `See #6013 L#NN-50 #23 codification for the canonical fix.`,
      );
    }

    expect(violations).toHaveLength(0);
  });
});