/**
 * Asaas payment provider adapter.
 * Handles event parsing for Asaas webhook notifications.
 *
 * Refactor (Day 18 #5538): 4 nearly-identical normalize functions replaced
 * by a single dispatch table (ASAAS_EVENT_HANDLERS) keyed by payload.event.
 * Each normalizeAsaasXxx export is now a thin wrapper that checks the
 * event name and delegates to dispatchAsaasEvent.
 * currency is now centralized as the default constant.
 */
import type { PaymentProviderType } from '../payment-schema';
import { errorMsg } from '../../agents/error-formatting';
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

type NormalizedAsaasPayment = {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'completed' | 'failed' | 'refunded';
  rawEventJson: string;
};

const ASAAS_DEFAULT_CURRENCY = 'brl' as const;

/** Verify an Asaas webhook signature using the API key as Bearer token. */
export function verifyAsaasWebhookRequest(
  payloadBody: string,
  apiKey: string,
  authHeader: string | null,
): AsaasWebhookPayload {
  if (authHeader === null || !authHeader.startsWith('Bearer ')) {
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
  } catch (err) {
    forgeDebug({
      scope: 'asaas',
      level: 'error',
      message: 'Asaas webhook JSON parse failed',
      context: { error: errorMsg(err) },
    });
    throw new Error('Asaas webhook: failed to parse JSON payload');
  }
}

function handleReceived(payload: AsaasWebhookPayload): NormalizedAsaasPayment | null {
  if (payload.event !== 'PAYMENT_RECEIVED') return null;
  const p = payload.payment;
  return {
    provider: 'asaas',
    providerPaymentId: p.id,
    subscriptionId: p.subscription,
    customerId: p.customer,
    amountUsd: p.value,
    currency: p.billingType === 'CREDIT_CARD' ? 'usd' : ASAAS_DEFAULT_CURRENCY,
    status: 'completed',
    rawEventJson: JSON.stringify(payload),
  };
}

function handleConfirmed(payload: AsaasWebhookPayload): NormalizedAsaasPayment | null {
  if (payload.event !== 'PAYMENT_CONFIRMED') return null;
  const p = payload.payment;
  return {
    provider: 'asaas',
    providerPaymentId: p.id,
    subscriptionId: p.subscription,
    customerId: p.customer,
    amountUsd: p.value,
    currency: ASAAS_DEFAULT_CURRENCY,
    status: 'completed',
    rawEventJson: JSON.stringify(payload),
  };
}

function handleFailed(payload: AsaasWebhookPayload): NormalizedAsaasPayment | null {
  if (payload.event !== 'PAYMENT_AWAITING_RISK_ANALYSIS' && payload.event !== 'PAYMENT_DENIED') return null;
  const p = payload.payment;
  return {
    provider: 'asaas',
    providerPaymentId: p.id,
    subscriptionId: p.subscription,
    customerId: p.customer,
    amountUsd: p.value,
    currency: ASAAS_DEFAULT_CURRENCY,
    status: 'failed',
    rawEventJson: JSON.stringify(payload),
  };
}

function handleRefunded(payload: AsaasWebhookPayload): NormalizedAsaasPayment | null {
  if (payload.event !== 'PAYMENT_REFUNDED') return null;
  const p = payload.payment;
  return {
    provider: 'asaas',
    providerPaymentId: p.id,
    subscriptionId: p.subscription,
    customerId: p.customer,
    amountUsd: p.value,
    currency: ASAAS_DEFAULT_CURRENCY,
    status: 'refunded',
    rawEventJson: JSON.stringify(payload),
  };
}

const ASAAS_EVENT_HANDLERS: Record<string, (payload: AsaasWebhookPayload) => NormalizedAsaasPayment | null> = {
  'PAYMENT_RECEIVED': handleReceived,
  'PAYMENT_CONFIRMED': handleConfirmed,
  'PAYMENT_AWAITING_RISK_ANALYSIS': handleFailed,
  'PAYMENT_DENIED': handleFailed,
  'PAYMENT_REFUNDED': handleRefunded,
};

function dispatchAsaasEvent(payload: AsaasWebhookPayload): NormalizedAsaasPayment | null {

  return ASAAS_EVENT_HANDLERS[payload.event]?.(payload) ?? null;
}

/** Map any Asaas webhook event to a normalized payment status. */
export function normalizeAsaasEvent(payload: AsaasWebhookPayload): {
  provider: PaymentProviderType;
  providerPaymentId: string;
  subscriptionId?: string;
  customerId: string;
  amountUsd: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  rawEventJson: string;
} | null {
  return dispatchAsaasEvent(payload);
}

/** Normalize an Asaas PAYMENT_RECEIVED event. */
export function normalizeAsaasPaymentReceived(payload: AsaasWebhookPayload): NormalizedAsaasPayment | null {
  return payload.event === 'PAYMENT_RECEIVED' ? dispatchAsaasEvent(payload) : null;
}

/** Normalize an Asaas PAYMENT_CONFIRMED event. */
export function normalizeAsaasPaymentConfirmed(payload: AsaasWebhookPayload): NormalizedAsaasPayment | null {
  return payload.event === 'PAYMENT_CONFIRMED' ? dispatchAsaasEvent(payload) : null;
}

/** Normalize an Asaas PAYMENT_AWAITING_RISK_ANALYSIS or PAYMENT_DENIED event. */
export function normalizeAsaasPaymentFailed(payload: AsaasWebhookPayload): NormalizedAsaasPayment | null {
  return payload.event === 'PAYMENT_AWAITING_RISK_ANALYSIS' || payload.event === 'PAYMENT_DENIED'
    ? dispatchAsaasEvent(payload)
    : null;
}

/** Normalize an Asaas PAYMENT_REFUNDED event. */
export function normalizeAsaasPaymentRefunded(payload: AsaasWebhookPayload): NormalizedAsaasPayment | null {
  return payload.event === 'PAYMENT_REFUNDED' ? dispatchAsaasEvent(payload) : null;
}
