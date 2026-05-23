/**
 * Asaas payment provider adapter.
 * Handles event parsing for Asaas webhook notifications.
 */

import type { PaymentProviderType } from '../payment-schema';
import { forgeDebug } from '@forge-runtime/core';

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
  if (authHeader === null || authHeader === undefined || !authHeader.startsWith('Bearer ')) {
    forgeDebug({
      scope: 'asaas',
      level: 'warn',
      message: 'verifyAsaasWebhookAuth: missing or invalid Bearer header',
    });
    throw new Error('Asaas webhook: missing or invalid Bearer authorization header');
  }
  if (authHeader.slice(7) !== apiKey) {
    forgeDebug({
      scope: 'asaas',
      level: 'warn',
      message: 'verifyAsaasWebhookAuth: invalid API key in header',
    });
    throw new Error('Asaas webhook: invalid API key in authorization header');
  }
  try {
    return JSON.parse(payloadBody) as AsaasWebhookPayload;
  } catch (error) {
    forgeDebug({
      scope: 'asaas',
      level: 'error',
      message: 'Asaas webhook JSON parse failed',
      context: { error: String(serializeError(error)) },
    });
    throw new Error('Asaas webhook: failed to parse JSON payload');
  }
}
import { serializeError } from '../../agents/agent-runner-error-formatting';

/** Normalize an Asaas PAYMENT_RECEIVED event. */
export function normalizeAsaasPaymentReceived(payload: AsaasWebhookPayload): {
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
export function normalizeAsaasPaymentConfirmed(payload: AsaasWebhookPayload): {
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
export function normalizeAsaasPaymentFailed(payload: AsaasWebhookPayload): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'failed';
  rawEventJson: string;
} | null {
  if (payload.event !== 'PAYMENT_AWAITING_RISK_ANALYSIS' && payload.event !== 'PAYMENT_DENIED')
    return null;
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

/** Normalize an Asaas PAYMENT_REFUNDED event. */
export function normalizeAsaasPaymentRefunded(payload: AsaasWebhookPayload): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'refunded';
  rawEventJson: string;
} | null {
  if (payload.event !== 'PAYMENT_REFUNDED') return null;
  const p = payload.payment;
  return {
    provider: 'asaas',
    providerPaymentId: p.id,
    subscriptionId: p.subscription,
    customerId: p.customer,
    amountUsd: p.value,
    currency: 'brl',
    status: 'refunded',
    rawEventJson: JSON.stringify(payload),
  };
}

/** Map any Asaas webhook event to a normalized payment status. */
export function normalizeAsaasEvent
(payload: AsaasWebhookPayload): {
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

  const refunded = normalizeAsaasPaymentRefunded(payload);
  if (refunded) return refunded;

  return null;
}
