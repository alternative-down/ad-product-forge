/**
 * Tests for Pattern L typed Errors in finance/payment-providers module (D51 #6502 batch 19).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *
 * See apps/forge/src/finance/payment-providers/errors.ts.
 */

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyAsaasWebhookRequest } from './asaas';
import {
  AsaasWebhookInvalidSignatureError,
  AsaasWebhookMissingSignatureHeaderError,
  AsaasWebhookParsePayloadError,
} from './errors';

const SECRET = 'whsec_test_asaas_secret';

function sign(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyAsaasWebhookRequest — Pattern L typed Errors (D51 #6502 batch 19)', () => {
  const body = JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } });

  it('throws AsaasWebhookMissingSignatureHeaderError with code discriminator when signature is null', () => {
    let captured: unknown;
    try {
      verifyAsaasWebhookRequest(body, SECRET, null);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(AsaasWebhookMissingSignatureHeaderError);
    expect((captured as AsaasWebhookMissingSignatureHeaderError).code).toBe(
      'ASAAS_WEBHOOK_MISSING_SIGNATURE_HEADER',
    );
    expect((captured as Error).message).toContain('missing x-asaas-signature');
  });

  it('throws AsaasWebhookInvalidSignatureError with code discriminator when signature mismatches', () => {
    let captured: unknown;
    try {
      verifyAsaasWebhookRequest(body, SECRET, 'sha256=' + '0'.repeat(64));
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(AsaasWebhookInvalidSignatureError);
    expect((captured as AsaasWebhookInvalidSignatureError).code).toBe(
      'ASAAS_WEBHOOK_INVALID_SIGNATURE',
    );
    expect((captured as Error).message).toContain('invalid signature');
  });

  it('throws AsaasWebhookInvalidSignatureError on tampered body', () => {
    const tampered = body.replace('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED');
    const signature = sign(body, SECRET);
    let captured: unknown;
    try {
      verifyAsaasWebhookRequest(tampered, SECRET, signature);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(AsaasWebhookInvalidSignatureError);
  });

  it('throws AsaasWebhookParsePayloadError with code discriminator when JSON is invalid', () => {
    const badBody = 'not-json';
    const badSignature = sign(badBody, SECRET);
    let captured: unknown;
    try {
      verifyAsaasWebhookRequest(badBody, SECRET, badSignature);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(AsaasWebhookParsePayloadError);
    expect((captured as AsaasWebhookParsePayloadError).code).toBe(
      'ASAAS_WEBHOOK_PARSE_PAYLOAD',
    );
    expect((captured as Error).message).toContain('parse JSON');
    expect((captured as AsaasWebhookParsePayloadError).errorMessage).toBeDefined();
  });
});
