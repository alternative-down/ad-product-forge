/**
 * Tests for Pattern L typed Errors in finance/payment-providers/stripe module (D51 #6502 batch 22).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *
 * See apps/forge/src/finance/payment-providers/errors.ts (extended for Stripe).
 */

import { describe, expect, it } from 'vitest';

import {
  StripeSignatureMissingTimestampError,
  StripeSignatureMissingV1SignatureError,
} from './errors';

describe('stripe signature — Pattern L typed Errors (D51 #6502 batch 22)', () => {
  it('StripeSignatureMissingTimestampError has discriminator and preserved message', () => {
    const error = new StripeSignatureMissingTimestampError();
    expect(error).toBeInstanceOf(StripeSignatureMissingTimestampError);
    expect(error.code).toBe('STRIPE_SIGNATURE_MISSING_TIMESTAMP');
    expect(error.message).toBe('Stripe-Signature header missing or invalid timestamp (t=)');
    expect(error.message).toContain('timestamp');
  });

  it('StripeSignatureMissingV1SignatureError has discriminator and preserved message', () => {
    const error = new StripeSignatureMissingV1SignatureError();
    expect(error).toBeInstanceOf(StripeSignatureMissingV1SignatureError);
    expect(error.code).toBe('STRIPE_SIGNATURE_MISSING_V1_SIGNATURE');
    expect(error.message).toBe('Stripe-Signature header missing v1 signature');
    expect(error.message).toContain('v1');
  });
});
