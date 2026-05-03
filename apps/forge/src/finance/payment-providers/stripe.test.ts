import { describe, it, expect } from 'vitest';
import {
  normalizeStripeEvent,
  parseStripePaymentSucceeded,
  parseStripePaymentFailed,
  parseStripeCheckoutCompleted,
} from './stripe';

function makeStripeEvent(type: string, data: Record<string, unknown> = {}): import('./stripe').StripeWebhookPayload {
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
      const event = makeStripeEvent('payment_intent.succeeded', {
        customer: 'cus_123',
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
      const event = makeStripeEvent('payment_intent.payment_failed', {
        customer: 'cus_123',
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
      const event = makeStripeEvent('payment_intent.succeeded', { customer: 'cus_123', amount: 1000 });
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
});
