/**
 * Asaas payment provider adapter.
 * Handles event parsing for Asaas webhook notifications.
 */

import type { PaymentProviderType } from './payment-schema';

/** Asaas webhook notification payload. */
export type AsaasWebhookPayload = {
  event: string;
  payment: {
    id: string;
    customer: string;
    subscription?: string;
    value: number;
    netValue: number;
    billingType: string;
    status: string;
    dueDate: string;
    paymentDate?: string;
    lastRetryDate?: string;
    invoiceUrl?: string;
    invoiceId?: string;
  };
};

/** Verify an Asaas webhook signature using the API key as Bearer token. */
export function verifyAsaasWebhookRequest(
  payloadBody: string,
  apiKey: string,
  authHeader: string | null,
): AsaasWebhookPayload {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Asaas webhook: missing or invalid Bearer authorization header');
  }
  if (authHeader.slice(7) !== apiKey) {
    throw new Error('Asaas webhook: invalid API key in authorization header');
  }
  try {
    return JSON.parse(payloadBody) as AsaasWebhookPayload;
  } catch {
    throw new Error('Asaas webhook: failed to parse JSON payload');
  }
}

/** Normalize an Asaas PAYMENT_RECEIVED event. */
export function normalizeAsaasPaymentReceived(
  payload: AsaasWebhookPayload,
): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'completed';
  rawEventJson: string;
} | null {
  if (payload.event !== 'PAYMENT_RECEIVED') return null;
  const p = payload.payment;
  return {
    provider: 'asaas',
    providerPaymentId: p.id,
    subscriptionId: p.subscription,
    customerId: p.customer,
    amountUsd: p.value,
    currency: p.billingType === 'CREDIT_CARD' ? 'usd' : 'brl',
    status: 'completed',
    rawEventJson: JSON.stringify(payload),
  };
}

/** Normalize an Asaas PAYMENT_CONFIRMED event. */
export function normalizeAsaasPaymentConfirmed(
  payload: AsaasWebhookPayload,
): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'completed';
  rawEventJson: string;
} | null {
  if (payload.event !== 'PAYMENT_CONFIRMED') return null;
  const p = payload.payment;
  return {
    provider: 'asaas',
    providerPaymentId: p.id,
    subscriptionId: p.subscription,
    customerId: p.customer,
    amountUsd: p.value,
    currency: 'brl',
    status: 'completed',
    rawEventJson: JSON.stringify(payload),
  };
}

/** Normalize an Asaas PAYMENT_CONFIRMED event. */
export function normalizeAsaasPaymentFailed(
  payload: AsaasWebhookPayload,
): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'failed';
  rawEventJson: string;
} | null {
  if (payload.event !== 'PAYMENT_AWAITING_RISK_ANALYSIS' && payload.event !== 'PAYMENT_DENIED') return null;
  const p = payload.payment;
  return {
    provider: 'asaas',
    providerPaymentId: p.id,
    subscriptionId: p.subscription,
    customerId: p.customer,
    amountUsd: p.value,
    currency: 'brl',
    status: 'failed',
    rawEventJson: JSON.stringify(payload),
  };
}

/** Map any Asaas webhook event to a normalized payment status. */
export function normalizeAsaasEvent(
  payload: AsaasWebhookPayload,
): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  rawEventJson: string;
} | null {
  const received = normalizeAsaasPaymentReceived(payload);
  if (received) return received;

  const confirmed = normalizeAsaasPaymentConfirmed(payload);
  if (confirmed) return confirmed;

  const failed = normalizeAsaasPaymentFailed(payload);
  if (failed) return failed;

  return null;
}
