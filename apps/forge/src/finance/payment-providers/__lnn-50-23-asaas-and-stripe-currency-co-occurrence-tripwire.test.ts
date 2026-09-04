/**
 * L#NN-50 #23 N=5 tripwire — Asaas and Stripe payment provider adapters.
 *
 * Context: Pre-tripwire, every `amountUsd:` write in asaas.ts (4 handlers) and
 * stripe.ts (4 parsers) wrote ONLY `amountUsd: p.value` (Asaas) or
 * `amountUsd: obj.amount / 100` (Stripe) WITHOUT explicit guarantee that the
 * `currency:` field was set in the SAME handler return literal. The existing
 * L#NN-50 #23 N=4 tripwire (payment-receivables.ts scope) covers INSERT callsites
 * but does NOT cover the normalize/parse layer where the value already gets
 * a misnamed `amountUsd` field for non-USD currencies (BRL for Asaas,
 * EUR/GBP for Stripe).
 *
 * Issue #6876: 5 handlers in asaas.ts store BRL value as amountUsd. The DB column
 * is named `amount_usd` and the JS field is `amountUsd`, but the actual value
 * is in the row's `currency` (BRL for Asaas, event.currency for Stripe).
 *
 * L#NN-50 #23 N=5 codification: every `amountUsd:` field write in
 * asaas.ts and stripe.ts MUST be co-occurred with a `currency:` field in the
 * SAME return-object literal.
 *
 * Why this matters:
 *  - Downstream aggregation in company-cash-operations.ts reads amountUsd AS IF
 *    it were USD. If the row's currency is BRL/EUR/GBP, the aggregation is wrong
 *    by the FX rate.
 *  - The naming lie (amountUsd != USD value) is the root cause of #6876.
 *  - This tripwire catches future Asaas/Stripe handlers that forget the
 *    currency: field (e.g. a new event type or billing model).
 *
 * Scope: asaas.ts and stripe.ts in apps/forge/src/finance/payment-providers/.
 * Implementation: parse `return { ... }` blocks containing `amountUsd:` and
 * assert that each such block also contains `currency:` in the same literal.
 *
 * Tripwire adoption: uses readSource/relativeToHere from tripwire-helpers for
 * path resolution and file reading (L#NN-32 v8 / #6210 meta-tripwire compliance).
 */
import { describe, it, expect } from 'vitest';
import { readSource, relativeToHere } from '../../tripwire-helpers';

const TARGET_FILES = [
  relativeToHere('finance', 'payment-providers', 'asaas.ts'),
  relativeToHere('finance', 'payment-providers', 'stripe.ts'),
];

/** Strip comments to prevent commented-out violations from satisfying the regex. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Find every `return { ... }` object literal block (single-line) that contains
 * `amountUsd:` and check if `currency:` is also in the same literal. We use
 * a multiline-aware scanner rather than a pure regex because the literals
 * span multiple lines.
 *
 * We restrict to literals that actually contain `amountUsd:` to keep this tripwire
 * narrow and avoid false positives in unrelated code paths (e.g. error literals).
 */
function findAmountUsdLiterals(source: string): Array<{
  line: number;
  block: string;
}> {
  const lines = source.split('\n');
  const violations: Array<{ line: number; block: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/amountUsd\s*:/.test(lines[i])) continue;

    // Scan backward for the nearest `return {` opening (within 12 lines).
    // Scan forward for the closing `}` (next 30 lines).
    let openLine = -1;
    for (let j = i; j >= Math.max(0, i - 12); j--) {
      if (/return\s*\{/.test(lines[j])) {
        openLine = j;
        break;
      }
    }
    if (openLine === -1) continue;

    // Collect lines from the `return {` through to its closing brace.
    let closeLine = -1;
    let depth = 0;
    let seenOpen = false;
    for (let k = openLine; k < Math.min(lines.length, openLine + 30); k++) {
      for (const ch of lines[k]) {
        if (ch === '{') {
          if (depth === 0 && !seenOpen) {
            seenOpen = true;
          }
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && seenOpen) {
            closeLine = k;
            break;
          }
        }
      }
      if (closeLine !== -1) break;
    }
    if (closeLine === -1) continue;

    const block = lines.slice(openLine, closeLine + 1).join('\n');
    if (!/currency\s*:/.test(block)) {
      violations.push({ line: openLine + 1, block });
    }

    // Skip ahead to avoid duplicate reporting when multiple `amountUsd:` appear
    // in the same return literal — we only want one violation per block.
    i = closeLine;
  }

  return violations;
}

describe('payment-providers/asaas.ts + stripe.ts L#NN-50 #23 tripwire', () => {
  for (const file of TARGET_FILES) {
    const name = file.split('/').pop();
    describe(`${name}: every \`amountUsd:\` write pairs with \`currency:\` in the same return literal`, () => {
      const raw = readSource(file);
      const stripped = stripComments(raw);

      it('file exists and is readable', () => {
        expect(raw.length).toBeGreaterThan(0);
      });

      it('has no amountUsd-return literal missing a co-located currency field', () => {
        const violations = findAmountUsdLiterals(stripped);

        if (violations.length > 0) {
          const message = violations
            .map(
              (v) =>
                `  Line ${v.line}:\n${v.block
                  .split('\n')
                  .map((l) => '    ' + l)
                  .join('\n')}`,
            )
            .join('\n\n');
          throw new Error(
            `L#NN-50 #23 N=5 violation — ${name} has ${violations.length} ` +
              `\`amountUsd:\` return literal(s) missing a co-located \`currency:\` field:\n\n${message}\n\n` +
              `Every \`amountUsd:\` write in ${name} MUST include a co-located \`currency:\` field ` +
              `in the same return literal. See #6876 L#NN-50 #23 N=5 for context.`,
          );
        }

        expect(violations).toHaveLength(0);
      });
    });
  }
});
