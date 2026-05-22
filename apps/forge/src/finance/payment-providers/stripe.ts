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
  const amount = typeof obj.amount === 'number' ? obj.amount : 0;
  return {
    provider: 'stripe',
    providerPaymentId: event.id,
    subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : undefined,
    customerId: typeof obj.customer === 'string' ? obj.customer : '',
    amountUsd: amount / 100,
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
  const amount = typeof obj.amount === 'number' ? obj.amount : 0;
  const lastError = (obj.last_payment_error as Record<string, unknown>) ?? {};
  return {
    provider: 'stripe',
    providerPaymentId: event.id,
    subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : undefined,
    customerId: typeof obj.customer === 'string' ? obj.customer : '',
    amountUsd: amount / 100,
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
  const amount = typeof obj.amount_total === 'number' ? obj.amount_total : 0;
  return {
    provider: 'stripe',
    providerPaymentId: event.id,
    subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : undefined,
    customerId: typeof obj.customer === 'string' ? obj.customer : '',
    amountUsd: amount / 100,
    currency: String(obj.currency ?? 'usd'),
    status: 'completed',
  };
}

/** Map any Stripe webhook event to a normalized payment status. */
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

  return null;
}