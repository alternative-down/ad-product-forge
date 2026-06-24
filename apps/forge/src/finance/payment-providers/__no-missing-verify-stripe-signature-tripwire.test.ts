/**
 * L#NN-50 tripwire (regression for #6044 P0 SEC):
 * `finance/payment-providers/stripe.ts` MUST export a function
 * `verifyStripeWebhookSignature` that uses HMAC-SHA256 + timingSafeEqual.
 *
 * History: commit ec032b31 (2026-05-22) removed the original
 * `verifyStripeWebhookSignature` because it was unused. This left Stripe
 * webhooks with NO authentication before parsing — anyone could spoof
 * `payment_intent.succeeded` and corrupt the ledger.
 *
 * This tripwire asserts the function exists, is exported, uses HMAC-SHA256,
 * uses timingSafeEqual for constant-time comparison, and is NOT marked as
 * `@deprecated` (the original may have been flagged as "unused" by lint and
 * removed; the new implementation must be the canonical path).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const STRIPE_FILE = join(__dirname, 'stripe.ts');

describe('L#NN-50 tripwire — Stripe webhook signature verification (issue #6044 P0 SEC)', () => {
  const source = readFileSync(STRIPE_FILE, 'utf8');

  it('stripe.ts exports verifyStripeWebhookSignature', () => {
    expect(source).toMatch(/export function verifyStripeWebhookSignature\s*\(/);
  });

  it('verifyStripeWebhookSignature uses HMAC-SHA256', () => {
    expect(source).toMatch(/createHmac\(\s*['"]sha256['"]/);
  });

  it('verifyStripeWebhookSignature uses timingSafeEqual for constant-time comparison', () => {
    expect(source).toMatch(/timingSafeEqual\s*\(/);
  });

  it('verifyStripeWebhookSignature is NOT marked @deprecated', () => {
    // The function declaration must not have a @deprecated JSDoc tag on the
    // line(s) immediately preceding it.
    const match = source.match(
      /([\s\S]{0,200})export function verifyStripeWebhookSignature\s*\(/,
    );
    expect(match).not.toBeNull();
    const precedingDoc = match![1] ?? '';
    expect(precedingDoc).not.toMatch(/@deprecated/i);
  });

  it('verifyStripeWebhookSignature is not just a stub (body must contain real logic)', () => {
    // The function body must reference createHmac or timingSafeEqual (not be empty
    // or just `throw new Error('TODO')`).
    // Match the function body — allow multi-line signatures, return type, and default params
    const fnStart = source.indexOf('export function verifyStripeWebhookSignature');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const braceStart = source.indexOf('{', fnStart);
    expect(braceStart).toBeGreaterThan(fnStart);
    // Brace-count from braceStart to find matching close
    let depth = 0;
    let braceEnd = -1;
    for (let i = braceStart; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) { braceEnd = i; break; }
      }
    }
    expect(braceEnd).toBeGreaterThan(braceStart);
    const body = source.slice(braceStart + 1, braceEnd);
    expect(body).toMatch(/createHmac|timingSafeEqual/);
  });
});
