/**
 * Stripe payment provider adapter.
 * Handles signature verification and event parsing for Stripe webhooks.
 *
 * Refactor (Day 18 #5538): 4 nearly-identical parse functions replaced by
 * a single dispatch table (STRIPE_EVENT_HANDLERS) keyed by event.type.
 * Each parseXxx export is now a thin wrapper that checks the type and
 * delegates to dispatchStripeEvent. The redundant `currency: x.currency`
 * no-op in normalizeStripeEvent is also removed.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { PaymentProviderType } from '../payment-schema';

export type StripeWebhookPayload = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

type NormalizedStripePayment = {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'completed' | 'failed' | 'refunded';
  failureReason?: string;
};

const STRIPE_DEFAULT_CURRENCY = 'usd' as const;

function parseSucceeded(event: StripeWebhookPayload): NormalizedStripePayment | null {
  const obj = event.data.object as Record<string, unknown>;
  if (typeof obj.customer !== 'string') return null;
  if (typeof obj.amount !== 'number') return null;
  return {
    provider: 'stripe',
    providerPaymentId: event.id,
    subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : undefined,
    customerId: obj.customer,
    amountUsd: obj.amount / 100,
    currency: String(obj.currency ?? STRIPE_DEFAULT_CURRENCY),
    status: 'completed',
  };
}

function parseFailed(event: StripeWebhookPayload): NormalizedStripePayment | null {
  const obj = event.data.object as Record<string, unknown>;
  if (typeof obj.customer !== 'string') return null;
  if (typeof obj.amount !== 'number') return null;
  const lastError = (obj.last_payment_error as Record<string, unknown>) ?? {};
  return {
    provider: 'stripe',
    providerPaymentId: event.id,
    subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : undefined,
    customerId: obj.customer,
    amountUsd: obj.amount / 100,
    currency: String(obj.currency ?? STRIPE_DEFAULT_CURRENCY),
    status: 'failed',
    failureReason: typeof lastError.message === 'string' ? lastError.message : undefined,
  };
}

function parseCheckoutCompleted(event: StripeWebhookPayload): NormalizedStripePayment | null {
  const obj = event.data.object as Record<string, unknown>;
  if (typeof obj.customer !== 'string') return null;
  if (typeof obj.amount_total !== 'number') return null;
  return {
    provider: 'stripe',
    providerPaymentId: event.id,
    subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : undefined,
    customerId: obj.customer,
    amountUsd: obj.amount_total / 100,
    currency: String(obj.currency ?? STRIPE_DEFAULT_CURRENCY),
    status: 'completed',
  };
}

function parseRefunded(event: StripeWebhookPayload): NormalizedStripePayment | null {
  const obj = event.data.object as Record<string, unknown>;
  if (typeof obj.customer !== 'string') return null;
  const amount =
    typeof obj.amount === 'number'
      ? obj.amount
      : typeof obj.amount_refunded === 'number'
        ? obj.amount_refunded
        : null;
  if (amount === null) return null;
  return {
    provider: 'stripe',
    providerPaymentId: event.id,
    subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : undefined,
    customerId: obj.customer,
    amountUsd: amount / 100,
    currency: String(obj.currency ?? STRIPE_DEFAULT_CURRENCY),
    status: 'refunded',
  };
}

const STRIPE_EVENT_HANDLERS: Record<string, (event: StripeWebhookPayload) => NormalizedStripePayment | null> = {
  'payment_intent.succeeded': parseSucceeded,
  'payment_intent.payment_failed': parseFailed,
  'checkout.session.completed': parseCheckoutCompleted,
  'charge.refunded': parseRefunded,
  'payment_intent.refunded': parseRefunded,
};

function dispatchStripeEvent(event: StripeWebhookPayload): NormalizedStripePayment | null {

  return STRIPE_EVENT_HANDLERS[event.type]?.(event) ?? null;
}

/** Map any Stripe webhook event to a normalized payment. */
export function normalizeStripeEvent(event: StripeWebhookPayload): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  failureReason?: string;
  rawEventJson: string;
} | null {
  const result = dispatchStripeEvent(event);
  return result ? { ...result, rawEventJson: JSON.stringify(event) } : null;
}

/** Parse a completed payment_intent.succeeded Stripe event. */
/**
 * Default tolerance window for Stripe webhook signature timestamp (5 minutes,
 * matches Stripe's documented default). Replay attacks beyond this window are
 * rejected.
 */
const STRIPE_DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Verify a Stripe webhook signature using HMAC-SHA256.
 *
 * Stripe-Signature header format: `t=<unix_seconds>,v1=<hex>[,v1=<hex>...]`
 * - The signed payload is `"${timestamp}.${rawBody}"`.
 * - Multiple v1 entries are supported for key rotation: a signature is valid
 *   if it matches ANY of the v1 entries.
 * - Timestamp tolerance protects against replay attacks.
 *
 * Pure function — no logging, no side effects. Caller is responsible for
 * logging on failure and rejecting the request with 401.
 *
 * Security:
 * - Uses timingSafeEqual to prevent signature comparison timing attacks.
 * - Throws on malformed header (NOT on signature mismatch — that returns false)
 *   so the caller can distinguish "bad request" (400) from "unauthorized" (401).
 *
 * Issue: #6044 (P0 SEC) — the previous verifyStripeWebhookSignature was removed
 * in commit ec032b31 because it was unused. This re-implementation is protected
 * by the tripwire test __no-missing-verify-stripe-signature-tripwire.test.ts.
 *
 * @param payloadBody - Raw request body string (NOT parsed JSON)
 * @param signatureHeader - Value of the Stripe-Signature header
 * @param secret - Webhook signing secret (from Stripe dashboard)
 * @param toleranceSeconds - Max age of timestamp in seconds (default 300)
 * @param nowSeconds - Override current time (for tests); default Date.now()/1000
 * @returns true if signature is valid AND timestamp is within tolerance
 * @throws Error if signatureHeader is malformed (missing t= or v1=)
 */
export function verifyStripeWebhookSignature(
  payloadBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
  toleranceSeconds: number = STRIPE_DEFAULT_TOLERANCE_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader) {
    return false;
  }
  const parts = signatureHeader.split(',');
  let timestamp: number | null = null;
  const v1Signatures: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) timestamp = parsed;
    } else if (key === 'v1') {
      v1Signatures.push(value);
    }
  }
  if (timestamp === null) {
    throw new Error('Stripe-Signature header missing or invalid timestamp (t=)');
  }
  if (v1Signatures.length === 0) {
    throw new Error('Stripe-Signature header missing v1 signature');
  }
  // Replay protection: reject signatures whose timestamp is outside tolerance.
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }
  // Compute expected signature: HMAC-SHA256(secret, "t.body")
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payloadBody}`)
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  for (const sig of v1Signatures) {
    const sigBuf = Buffer.from(sig, 'hex');
    if (sigBuf.length !== expectedBuf.length) continue;
    try {
      if (timingSafeEqual(expectedBuf, sigBuf)) return true;
    } catch {
      // length mismatch (already checked) or other error — try next signature
    }
  }
  return false;
}

export function parseStripePaymentSucceeded(event: StripeWebhookPayload): NormalizedStripePayment | null {
  return event.type === 'payment_intent.succeeded' ? dispatchStripeEvent(event) : null;
}

/** Parse a failed payment_intent.payment_failed Stripe event. */
export function parseStripePaymentFailed(event: StripeWebhookPayload): NormalizedStripePayment | null {
  return event.type === 'payment_intent.payment_failed' ? dispatchStripeEvent(event) : null;
}

/** Parse a checkout.session.completed Stripe event (alternative to payment_intent). */
export function parseStripeCheckoutCompleted(event: StripeWebhookPayload): NormalizedStripePayment | null {
  return event.type === 'checkout.session.completed' ? dispatchStripeEvent(event) : null;
}

/** Parse a refund event (charge.refunded or payment_intent.refunded). */
export function parseStripePaymentRefunded(event: StripeWebhookPayload): NormalizedStripePayment | null {
  return event.type === 'charge.refunded' || event.type === 'payment_intent.refunded'
    ? dispatchStripeEvent(event)
    : null;
}
