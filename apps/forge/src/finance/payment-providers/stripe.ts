/**
 * Stripe payment provider adapter.
 * Handles signature verification and event parsing for Stripe webhooks.
 */
import type { PaymentProviderType } from '../payment-schema';

export type StripeWebhookPayload = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

/** Parse a completed payment_intent.succeeded Stripe event. */
export function parseStripePaymentSucceeded(event: StripeWebhookPayload): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'completed';
} | null {
  if (event.type !== 'payment_intent.succeeded') return null;
  const obj = event.data.object as Record<string, unknown>;
  if (typeof obj.customer !== 'string') return null;
  if (typeof obj.amount !== 'number') return null;
  return {
    provider: 'stripe',
    providerPaymentId: event.id,
    subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : undefined,
    customerId: obj.customer,
    amountUsd: obj.amount / 100,
    currency: String(obj.currency ?? 'usd'),
    status: 'completed',
  };
}

/** Parse a failed payment_intent.payment_failed Stripe event. */
export function parseStripePaymentFailed(event: StripeWebhookPayload): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'failed';
  failureReason?: string;
} | null {
  if (event.type !== 'payment_intent.payment_failed') return null;
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
    currency: String(obj.currency ?? 'usd'),
    status: 'failed',
    failureReason: typeof lastError.message === 'string' ? lastError.message : undefined,
  };
}

/** Parse a checkout.session.completed Stripe event (alternative to payment_intent). */
export function parseStripeCheckoutCompleted(event: StripeWebhookPayload): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'completed';
} | null {
  if (event.type !== 'checkout.session.completed') return null;
  const obj = event.data.object as Record<string, unknown>;
  if (typeof obj.customer !== 'string') return null;
  if (typeof obj.amount_total !== 'number') return null;
  return {
    provider: 'stripe',
    providerPaymentId: event.id,
    subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : undefined,
    customerId: obj.customer,
    amountUsd: obj.amount_total / 100,
    currency: String(obj.currency ?? 'usd'),
    status: 'completed',
  };
}


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
  // Each parse function returns null early if customer or amount is missing (#5635).
  const succeeded = parseStripePaymentSucceeded(event);
  if (succeeded) {
    return { ...succeeded, currency: succeeded.currency, rawEventJson: JSON.stringify(event) };
  }

  const failed = parseStripePaymentFailed(event);
  if (failed) {
    return { ...failed, currency: failed.currency, rawEventJson: JSON.stringify(event) };
  }

  const checkout = parseStripeCheckoutCompleted(event);
  if (checkout) {
    return { ...checkout, currency: checkout.currency, rawEventJson: JSON.stringify(event) };
  }

  const refunded = parseStripePaymentRefunded(event);
  if (refunded) {
    return { ...refunded, currency: refunded.currency, rawEventJson: JSON.stringify(event) };
  }

  return null;
}
/** Parse a refund event (charge.refunded or payment_intent.refunded). */
export function parseStripePaymentRefunded(event: StripeWebhookPayload): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'refunded';
} | null {
  if (event.type !== 'charge.refunded' && event.type !== 'payment_intent.refunded') return null;
  const obj = event.data.object as Record<string, unknown>;
  if (typeof obj.customer !== 'string') return null;
  const amount = typeof obj.amount === 'number'
    ? obj.amount
    : typeof obj.amount_refunded === 'number'
      ? obj.amount_refunded
      : null;
  if (amount === null) return null;
  const currency = String(obj.currency ?? 'usd');
  return {
    provider: 'stripe',
    providerPaymentId: event.id,
    subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : undefined,
    customerId: obj.customer,
    amountUsd: amount / 100,
    currency,
    status: 'refunded',
  };
}
