import { describe, it, expect } from 'vitest';
import {
  normalizeStripeEvent,
  parseStripePaymentSucceeded,
  parseStripePaymentFailed,
  parseStripeCheckoutCompleted,
  parseStripePaymentRefunded,
} from './stripe';

function makeStripeEvent(
  type: string,
  data: Record<string, unknown> = {},
): import('./stripe').StripeWebhookPayload {
  return {
    id: 'evt_test_123',
    type,
    created: Date.now(),
    data: { object: data },
  };
}

describe('stripe adapter', () => {
  describe('parseStripePaymentSucceeded', () => {
    it('returns null for wrong event type', () => {
      const event = makeStripeEvent('customer.created');
      expect(parseStripePaymentSucceeded(event)).toBeNull();
    });

    it('parses a payment_intent.succeeded event', () => {
      const event = makeStripeEvent('payment_intent.succeeded', {
        id: 'pi_test',
        customer: 'cus_123',
        amount: 4999,
        currency: 'usd',
        subscription: 'sub_456',
      });
      const result = parseStripePaymentSucceeded(event);
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('stripe');
      expect(result!.providerPaymentId).toBe('evt_test_123');
      expect(result!.customerId).toBe('cus_123');
      expect(result!.amountUsd).toBe(49.99);
      expect(result!.currency).toBe('usd');
      expect(result!.subscriptionId).toBe('sub_456');
      expect(result!.status).toBe('completed');
    });

    it('handles missing optional fields', () => {
      // amount is required (#5635) — provide it; test only checks subscriptionId is optional
      const event = makeStripeEvent('payment_intent.succeeded', {
        customer: 'cus_123',
        amount: 4999,
      });
      const result = parseStripePaymentSucceeded(event);
      expect(result).not.toBeNull();
      expect(result!.subscriptionId).toBeUndefined();
    });
  });

  describe('parseStripePaymentFailed', () => {
    it('returns null for wrong event type', () => {
      const event = makeStripeEvent('payment_intent.succeeded');
      expect(parseStripePaymentFailed(event)).toBeNull();
    });

    it('parses a payment_intent.payment_failed event', () => {
      const event = makeStripeEvent('payment_intent.payment_failed', {
        customer: 'cus_123',
        amount: 9900,
        last_payment_error: { message: 'card declined' },
      });
      const result = parseStripePaymentFailed(event);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('failed');
      expect(result!.failureReason).toBe('card declined');
    });

    it('handles missing error message', () => {
      // amount is required (#5635) — provide it; test only checks failureReason is optional
      const event = makeStripeEvent('payment_intent.payment_failed', {
        customer: 'cus_123',
        amount: 9900,
      });
      const result = parseStripePaymentFailed(event);
      expect(result).not.toBeNull();
      expect(result!.failureReason).toBeUndefined();
    });
  });

  describe('parseStripeCheckoutCompleted', () => {
    it('returns null for wrong event type', () => {
      const event = makeStripeEvent('payment_intent.succeeded');
      expect(parseStripeCheckoutCompleted(event)).toBeNull();
    });

    it('parses a checkout.session.completed event', () => {
      const event = makeStripeEvent('checkout.session.completed', {
        customer: 'cus_123',
        amount_total: 1999,
        currency: 'usd',
        subscription: 'sub_789',
      });
      const result = parseStripeCheckoutCompleted(event);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.amountUsd).toBe(19.99);
    });
  });

  describe('normalizeStripeEvent', () => {
    it('returns null for unknown event type', () => {
      const event = makeStripeEvent('customer.updated');
      expect(normalizeStripeEvent(event)).toBeNull();
    });

    it('includes rawEventJson in result', () => {
      const event = makeStripeEvent('payment_intent.succeeded', {
        customer: 'cus_123',
        amount: 1000,
      });
      const result = normalizeStripeEvent(event);
      expect(result).not.toBeNull();
      expect(result!.rawEventJson).toBeDefined();
      expect(() => JSON.parse(result!.rawEventJson)).not.toThrow();
    });

    it('returns failed event with failureReason', () => {
      const event = makeStripeEvent('payment_intent.payment_failed', {
        customer: 'cus_123',
        amount: 5000,
        last_payment_error: { message: 'insufficient funds' },
      });
      const result = normalizeStripeEvent(event);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('failed');
      expect(result!.failureReason).toBe('insufficient funds');
    });
  });

  // ─── L#5635: required customerId + amountUsd (no default-empty-string / default-zero) ──

  describe('parseStripePaymentSucceeded required fields (#5635)', () => {
    it('returns null when customer is missing', () => {
      const event = makeStripeEvent('payment_intent.succeeded', {
        amount: 4999,
        currency: 'usd',
      });
      expect(parseStripePaymentSucceeded(event)).toBeNull();
    });

    it('returns null when amount is missing', () => {
      const event = makeStripeEvent('payment_intent.succeeded', {
        customer: 'cus_123',
        currency: 'usd',
      });
      expect(parseStripePaymentSucceeded(event)).toBeNull();
    });
  });

  describe('parseStripePaymentFailed required fields (#5635)', () => {
    it('returns null when customer is missing', () => {
      const event = makeStripeEvent('payment_intent.payment_failed', {
        amount: 9900,
        last_payment_error: { message: 'card declined' },
      });
      expect(parseStripePaymentFailed(event)).toBeNull();
    });

    it('returns null when amount is missing', () => {
      const event = makeStripeEvent('payment_intent.payment_failed', {
        customer: 'cus_123',
        last_payment_error: { message: 'card declined' },
      });
      expect(parseStripePaymentFailed(event)).toBeNull();
    });
  });

  describe('parseStripeCheckoutCompleted required fields (#5635)', () => {
    it('returns null when customer is missing', () => {
      const event = makeStripeEvent('checkout.session.completed', {
        amount_total: 1999,
        currency: 'usd',
      });
      expect(parseStripeCheckoutCompleted(event)).toBeNull();
    });

    it('returns null when amount is missing', () => {
      const event = makeStripeEvent('checkout.session.completed', {
        customer: 'cus_123',
        currency: 'usd',
      });
      expect(parseStripeCheckoutCompleted(event)).toBeNull();
    });
  });

  describe('parseStripePaymentRefunded required fields (#5635)', () => {
    it('returns null when customer is missing (charge.refunded)', () => {
      const event = makeStripeEvent('charge.refunded', {
        amount: 1000,
        currency: 'usd',
      });
      expect(parseStripePaymentRefunded(event)).toBeNull();
    });

    it('returns null when both amount and amount_refunded are missing', () => {
      const event = makeStripeEvent('payment_intent.refunded', {
        customer: 'cus_123',
        currency: 'usd',
      });
      expect(parseStripePaymentRefunded(event)).toBeNull();
    });
  });

  describe('normalizeStripeEvent null propagation (#5635)', () => {
    it('returns null when customer is missing from a parseable event', () => {
      const event = makeStripeEvent('payment_intent.succeeded', {
        amount: 1000,
        currency: 'usd',
      });
      expect(normalizeStripeEvent(event)).toBeNull();
    });

    it('returns null when amount is missing from a parseable event', () => {
      const event = makeStripeEvent('checkout.session.completed', {
        customer: 'cus_123',
        currency: 'usd',
      });
      expect(normalizeStripeEvent(event)).toBeNull();
    });
  });

  // ─── L#NN-19 tripwire: catches default-empty-string and default-zero regressions ──
  // Source-level compliance (per L#NN-13 13a): read the file and assert the
  // anti-patterns do NOT appear. Uses RegExp constructor to avoid OXC parser
  // regex-literal bug (per L#NN-9 OXC gotcha).
  describe('L#NN-19 tripwire: no default-empty-string customerId, no default-zero amount (#5635)', () => {
    it('stripe.ts source does not contain the default-empty-string customerId pattern', async () => {
      const fsModule = await import('fs');
      const url = await import('url');
      const stripePath = url.fileURLToPath(new URL('./stripe.ts', import.meta.url));
      const source = fsModule.readFileSync(stripePath, 'utf8');
      // The pattern: customerId defaulting to empty string (the L#19 risk).
      // We check for the assignment pattern "customerId: ... : ''" anywhere in source.
      // String-based check is more semantic and lint-clean than regex.
      const defaultEmpty = /customerId:[^\n]*: ''/.test(source);
      expect(defaultEmpty).toBe(false);
    });

    it('stripe.ts source does not contain the default-zero amount pattern', async () => {
      const fsModule = await import('fs');
      const url = await import('url');
      const stripePath = url.fileURLToPath(new URL('./stripe.ts', import.meta.url));
      const source = fsModule.readFileSync(stripePath, 'utf8');
      // The pattern: amount defaulting to literal 0 in the typeof-amount === 'number' ?: 0 ternary.
      // We check for the typeof-amount + : 0 substrings within 80 chars of each other.
      const idx0 = source.indexOf(': 0');
      const idxTypeof = source.indexOf("typeof obj.amount");
      // Both must be present, and the ': 0' must be within 80 chars of the typeof-amount ternary
      const hasDefaultZero = idx0 !== -1 && idxTypeof !== -1
        && Math.abs(idx0 - idxTypeof) < 80;
      expect(hasDefaultZero).toBe(false);
    });
  });
});
