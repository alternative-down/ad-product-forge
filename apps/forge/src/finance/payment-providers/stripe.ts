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
