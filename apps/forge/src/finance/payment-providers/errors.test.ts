/**
 * Tests for Pattern L typed Errors in finance/payment-providers module (D52 #6628 batch 1).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields (errorMessage) are exposed on the error for downstream consumers
 *
 * See apps/forge/src/finance/payment-providers/errors.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  AsaasWebhookInvalidSignatureError,
  AsaasWebhookMissingSignatureHeaderError,
  AsaasWebhookParsePayloadError,
  StripeSignatureMissingTimestampError,
  StripeSignatureMissingV1SignatureError,
} from './errors';

describe('finance/payment-providers/errors — Pattern L typed Errors (D52 #6628 batch 1)', () => {
  it('AsaasWebhookMissingSignatureHeaderError preserves verbatim message', () => {
    const error = new AsaasWebhookMissingSignatureHeaderError();
    expect(error).toBeInstanceOf(AsaasWebhookMissingSignatureHeaderError);
    expect(error.code).toBe('ASAAS_WEBHOOK_MISSING_SIGNATURE_HEADER');
    expect(error.name).toBe('AsaasWebhookMissingSignatureHeaderError');
    expect(error.message).toBe('Asaas webhook: missing x-asaas-signature header');
  });

  it('AsaasWebhookInvalidSignatureError preserves verbatim message', () => {
    const error = new AsaasWebhookInvalidSignatureError();
    expect(error).toBeInstanceOf(AsaasWebhookInvalidSignatureError);
    expect(error.code).toBe('ASAAS_WEBHOOK_INVALID_SIGNATURE');
    expect(error.name).toBe('AsaasWebhookInvalidSignatureError');
    expect(error.message).toBe('Asaas webhook: invalid signature');
  });

  it('AsaasWebhookParsePayloadError captures errorMessage and preserves base message', () => {
    const error = new AsaasWebhookParsePayloadError('unexpected token at position 5');
    expect(error).toBeInstanceOf(AsaasWebhookParsePayloadError);
    expect(error.code).toBe('ASAAS_WEBHOOK_PARSE_PAYLOAD');
    expect(error.name).toBe('AsaasWebhookParsePayloadError');
    expect(error.errorMessage).toBe('unexpected token at position 5');
    expect(error.message).toBe('Asaas webhook: failed to parse JSON payload');
  });

  it('StripeSignatureMissingTimestampError preserves verbatim message', () => {
    const error = new StripeSignatureMissingTimestampError();
    expect(error).toBeInstanceOf(StripeSignatureMissingTimestampError);
    expect(error.code).toBe('STRIPE_SIGNATURE_MISSING_TIMESTAMP');
    expect(error.name).toBe('StripeSignatureMissingTimestampError');
    expect(error.message).toBe(
      'Stripe-Signature header missing or invalid timestamp (t=)',
    );
  });

  it('StripeSignatureMissingV1SignatureError preserves verbatim message', () => {
    const error = new StripeSignatureMissingV1SignatureError();
    expect(error).toBeInstanceOf(StripeSignatureMissingV1SignatureError);
    expect(error.code).toBe('STRIPE_SIGNATURE_MISSING_V1_SIGNATURE');
    expect(error.name).toBe('StripeSignatureMissingV1SignatureError');
    expect(error.message).toBe('Stripe-Signature header missing v1 signature');
  });
});
