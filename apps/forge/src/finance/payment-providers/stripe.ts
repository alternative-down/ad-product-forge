/**
 * Stripe payment provider adapter.
 * Handles signature verification and event parsing for Stripe webhooks.
 */
import { forgeDebug } from '@forge-runtime/core';

import type { PaymentProviderType } from '../payment-schema';
import { serializeError } from '../../agents/agent-runner-error-formatting';

export type StripeWebhookPayload = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
};

/**
 * Verify a Stripe webhook signature using the webhook secret.
 * Throws if the signature is invalid.
 */
function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  webhookSecret: string,
): StripeWebhookPayload {
  // Import stripe dynamically to avoid issues when stripe package is not installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const stripe = require('stripe') as typeof import('stripe');
    // @ts-expect-error -- stripe.webhooks not on module type in stripe 22.x
    const event = stripe.webhooks.constructEvent(payload, signatureHeader, webhookSecret);
    return event as unknown as StripeWebhookPayload;
  } catch (err) {
    forgeDebug({
      scope: 'stripe',
      level: 'error',
      message: 'Stripe webhook verification failed',
      context: { error: String(serializeError(err)) },
    });
    throw new Error(`Stripe webhook signature verification failed: ${String(serializeError(err))}`);
  }
}

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
