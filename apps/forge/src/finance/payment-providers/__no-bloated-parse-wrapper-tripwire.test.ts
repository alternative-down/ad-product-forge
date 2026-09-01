/**
 * L#NN-50 tripwire (regression for #5538): parseXxx and normalizeAsaasXxx
 * functions in payment-providers/{stripe,asaas}.ts must be THIN WRAPPERS
 * that delegate to the dispatch table. They should NOT contain the
 * full parse/normalize logic inline. This is the structural contract
 * that makes the dispatch-table refactor (Day 18 #5538) effective.
 *
 * Rules:
 *   - parseXxx / normalizeAsaasXxx function body must be at most 5 lines
 *     (excluding the function signature and closing brace).
 *   - Body must contain exactly one call to dispatchStripeEvent or
 *     dispatchAsaasEvent (the dispatch table delegate).
 *   - The 4 handlers + 1 dispatch table constant in each file must be
 *     present (positive structural assertion).
 *
 * The dispatchers normalizeStripeEvent and normalizeAsaasEvent are
 * exempt — they are the public dispatch entry point, not wrappers.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STRIPE_FILE = join(__dirname, 'stripe.ts');
const ASAAS_FILE = join(__dirname, 'asaas.ts');

const FN_HEADER_RE = (fnName: string): RegExp =>
  new RegExp('export function ' + fnName + '[^A-Za-z0-9_$]');
const WORD_BOUNDARY_RE = (name: string): RegExp =>
  new RegExp('[^A-Za-z0-9_$]' + name + '\\(');

/**
 * Returns the body of an exported function (lines between the opening
 * brace and the matching closing brace, exclusive).
 */
function extractFunctionBody(src: string, fnName: string): string | null {
  const m = FN_HEADER_RE(fnName).exec(src);
  if (!m) return null;
  const startBrace = src.indexOf('{', m.index);
  let depth = 1;
  let i = startBrace + 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return src.slice(startBrace + 1, i - 1);
}

function countLines(s: string): number {
  return s.split('\n').filter((l) => l.trim().length > 0).length;
}

function hasDispatchCall(body: string, dispatchFn: string): boolean {
  return WORD_BOUNDARY_RE(dispatchFn).test(body);
}

describe('payment-providers: thin parse-wrapper enforcement (regression for #5538)', () => {
  describe('stripe.ts', () => {
    const src = readFileSync(STRIPE_FILE, 'utf8');

    const thinWrappers = [
      'parseStripePaymentSucceeded',
      'parseStripePaymentFailed',
      'parseStripeCheckoutCompleted',
      'parseStripePaymentRefunded',
    ];

    for (const fn of thinWrappers) {
      it(fn + ' is a thin wrapper (body <= 5 lines, contains dispatchStripeEvent call)', () => {
        const body = extractFunctionBody(src, fn);
        expect(body, fn + ' should exist in stripe.ts').not.toBeNull();
        if (body === null) return;
        const lines = countLines(body);
        expect(lines, fn + ' body is ' + lines + ' lines; expected <= 5').toBeLessThanOrEqual(5);
        expect(
          hasDispatchCall(body, 'dispatchStripeEvent'),
          fn + ' should call dispatchStripeEvent (not implement logic inline)',
        ).toBe(true);
      });
    }

    it('stripe.ts contains STRIPE_EVENT_HANDLERS dispatch table', () => {
      expect(src).toMatch(/const STRIPE_EVENT_HANDLERS:\s*Record/);
    });

    it('stripe.ts has no redundant currency: x.currency no-op in normalizeStripeEvent', () => {
      const body = extractFunctionBody(src, 'normalizeStripeEvent');
      expect(body, 'normalizeStripeEvent should exist').not.toBeNull();
      if (body === null) return;
      expect(
        /currency:\s*\w+\.currency/.test(body),
        'normalizeStripeEvent should not contain the redundant currency: x.currency no-op',
      ).toBe(false);
    });
  });

  describe('asaas.ts', () => {
    const src = readFileSync(ASAAS_FILE, 'utf8');

    const thinWrappers = [
      'normalizeAsaasPaymentReceived',
      'normalizeAsaasPaymentConfirmed',
      'normalizeAsaasPaymentFailed',
      'normalizeAsaasPaymentRefunded',
    ];

    for (const fn of thinWrappers) {
      it(fn + ' is a thin wrapper (body <= 5 lines, contains dispatchAsaasEvent call)', () => {
        const body = extractFunctionBody(src, fn);
        expect(body, fn + ' should exist in asaas.ts').not.toBeNull();
        if (body === null) return;
        const lines = countLines(body);
        expect(lines, fn + ' body is ' + lines + ' lines; expected <= 5').toBeLessThanOrEqual(5);
        expect(
          hasDispatchCall(body, 'dispatchAsaasEvent'),
          fn + ' should call dispatchAsaasEvent (not implement logic inline)',
        ).toBe(true);
      });
    }

    it('asaas.ts contains ASAAS_EVENT_HANDLERS dispatch table', () => {
      expect(src).toMatch(/const ASAAS_EVENT_HANDLERS:\s*Record/);
    });

    it('asaas.ts has centralized ASAAS_DEFAULT_CURRENCY constant (no inline 3x brl hardcode)', () => {
      expect(src).toMatch(/const ASAAS_DEFAULT_CURRENCY\s*=\s*'brl'/);
      const brlCount = (src.match(/'brl'/g) || []).length;
      expect(
        brlCount,
        "'brl' literal appears " + brlCount + ' times; expected exactly 1 (only in the constant)',
      ).toBe(1);
    });
  });
});
