import { describe, it, expect } from 'vitest';
import {
  verifyAsaasWebhookRequest,
  normalizeAsaasPaymentReceived,
  normalizeAsaasPaymentConfirmed,
  normalizeAsaasPaymentFailed,
  normalizeAsaasEvent,
} from './asaas';

function makePayload(event: string, payment: Record<string, unknown> = {}): any {
  return { event, payment: { id: 'pay_test', customer: 'cust_1', value: 49.99, ...payment } };
}

describe('asaas adapter', () => {
  describe('verifyAsaasWebhookRequest', () => {
    it('parses a valid payload with correct Bearer token', () => {
      const payload = JSON.stringify(makePayload('PAYMENT_RECEIVED'));
      expect(() =>
        verifyAsaasWebhookRequest(payload, 'my-api-key', 'Bearer my-api-key'),
      ).not.toThrow();
    });

    it('throws for missing auth header', () => {
      expect(() => verifyAsaasWebhookRequest('{}', 'key', null)).toThrow('missing or invalid');
    });

    it('throws for incorrect API key', () => {
      expect(() => verifyAsaasWebhookRequest('{}', 'correct-key', 'Bearer wrong-key')).toThrow(
        'invalid API key',
      );
    });

    it('throws for invalid JSON payload', () => {
      expect(() => verifyAsaasWebhookRequest('not-json', 'key', 'Bearer key')).toThrow(
        'parse JSON',
      );
    });
  });

  describe('normalizeAsaasPaymentReceived', () => {
    it('returns null for wrong event', () => {
      const payload = makePayload('SUBSCRIPTION_CREATED');
      expect(normalizeAsaasPaymentReceived(payload)).toBeNull();
    });

    it('normalizes PAYMENT_RECEIVED event', () => {
      const payload = makePayload('PAYMENT_RECEIVED', { value: 99.99, subscription: 'sub_1' });
      const result = normalizeAsaasPaymentReceived(payload);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.provider).toBe('asaas');
      expect(result!.amountUsd).toBe(99.99);
      expect(result!.subscriptionId).toBe('sub_1');
      expect(result!.rawEventJson).toBeDefined();
    });
  });

  describe('normalizeAsaasPaymentConfirmed', () => {
    it('returns null for wrong event', () => {
      const payload = makePayload('PAYMENT_RECEIVED');
      expect(normalizeAsaasPaymentConfirmed(payload)).toBeNull();
    });

    it('normalizes PAYMENT_CONFIRMED event', () => {
      const payload = makePayload('PAYMENT_CONFIRMED', { value: 149.5 });
      const result = normalizeAsaasPaymentConfirmed(payload);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.currency).toBe('brl');
    });
  });

  describe('normalizeAsaasPaymentFailed', () => {
    it('returns null for unrelated events', () => {
      const payload = makePayload('PAYMENT_RECEIVED');
      expect(normalizeAsaasPaymentFailed(payload)).toBeNull();
    });

    it('normalizes PAYMENT_AWAITING_RISK_ANALYSIS as failed', () => {
      const payload = makePayload('PAYMENT_AWAITING_RISK_ANALYSIS', { value: 50.0 });
      const result = normalizeAsaasPaymentFailed(payload);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('failed');
    });

    it('normalizes PAYMENT_DENIED as failed', () => {
      const payload = makePayload('PAYMENT_DENIED');
      const result = normalizeAsaasPaymentFailed(payload);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('failed');
    });
  });

  describe('normalizeAsaasEvent', () => {
    it('returns null for unrecognized event', () => {
      const payload = makePayload('CUSTOMER_UPDATED');
      expect(normalizeAsaasEvent(payload)).toBeNull();
    });

    it('prefers PAYMENT_RECEIVED over other events', () => {
      const payload = makePayload('PAYMENT_RECEIVED');
      const result = normalizeAsaasEvent(payload);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
    });
  });
});
