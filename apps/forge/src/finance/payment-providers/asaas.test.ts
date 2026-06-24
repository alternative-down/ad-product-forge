import { createHmac } from 'node:crypto';
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
  describe('verifyAsaasWebhookRequest (#6043 P0 SEC — HMAC migration)', () => {
    const SECRET = 'whsec_test_asaas_secret';

    function sign(body: string, secret: string): string {
      return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    }

    it('parses a valid payload with correct HMAC signature', () => {
      const body = JSON.stringify(makePayload('PAYMENT_RECEIVED'));
      const signature = sign(body, SECRET);
      const result = verifyAsaasWebhookRequest(body, SECRET, signature);
      expect(result.event).toBe('PAYMENT_RECEIVED');
    });

    it('throws for missing signature header', () => {
      const body = JSON.stringify(makePayload('PAYMENT_RECEIVED'));
      expect(() => verifyAsaasWebhookRequest(body, SECRET, null)).toThrow(
        'missing x-asaas-signature',
      );
      expect(() => verifyAsaasWebhookRequest(body, SECRET, undefined)).toThrow(
        'missing x-asaas-signature',
      );
      expect(() => verifyAsaasWebhookRequest(body, SECRET, '')).toThrow(
        'missing x-asaas-signature',
      );
    });

    it('throws for invalid HMAC signature', () => {
      const body = JSON.stringify(makePayload('PAYMENT_RECEIVED'));
      const badSignature = sign(body, 'wrong-secret');
      expect(() => verifyAsaasWebhookRequest(body, SECRET, badSignature)).toThrow(
        'invalid signature',
      );
    });

    it('throws for tampered body (signature mismatch)', () => {
      const originalBody = JSON.stringify(makePayload('PAYMENT_RECEIVED'));
      const signature = sign(originalBody, SECRET);
      const tamperedBody = originalBody.replace('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED');
      expect(() => verifyAsaasWebhookRequest(tamperedBody, SECRET, signature)).toThrow(
        'invalid signature',
      );
    });

    it('throws for invalid JSON payload (even with valid signature)', () => {
      const body = 'not-json';
      const signature = sign(body, SECRET);
      expect(() => verifyAsaasWebhookRequest(body, SECRET, signature)).toThrow('parse JSON');
    });

    it('accepts signature without sha256= prefix', () => {
      const body = JSON.stringify(makePayload('PAYMENT_RECEIVED'));
      const signatureWithPrefix = sign(body, SECRET);
      const signatureNoPrefix = signatureWithPrefix.slice(7); // strip 'sha256='
      const result = verifyAsaasWebhookRequest(body, SECRET, signatureNoPrefix);
      expect(result.event).toBe('PAYMENT_RECEIVED');
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
