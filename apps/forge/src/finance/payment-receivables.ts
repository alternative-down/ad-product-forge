/**
 * Payment Receivables Store — handles Stripe/Asaas payment transactions.
 *
 * Design principles:
 * - Every confirmed payment creates one ledger entry, exactly once (idempotency by providerPaymentId)
 * - Failed payments are tracked without posting to the ledger
 * - All state transitions are explicit and auditable
 * - All DB operations wrapped with try/catch + forgeDebug for error logging
 */

import { eq, and, desc } from 'drizzle-orm';
import { errorMsg } from '../agents/error-formatting';
import { createId } from '../utils/id';

import type { Database } from '../database/client';
import {
  paymentProviders,
  paymentCustomers,
  paymentSubscriptions,
  paymentTransactions,
  type PaymentProviderType,
} from './payment-schema';
import { companyCashLedger } from '../database/schema';
import { forgeDebug } from '@forge-runtime/core';

interface InsertBuilder<T> {
  values<V extends Record<string, unknown>>(v: V): InsertBuilder<T>;
  returning<C extends Record<string, unknown>>(cols: C): Promise<{ [K in keyof C]: unknown }[]>;
}

export function createPaymentReceivablesStore(db: Database) {
  // ---------------------------------------------------------------------------
  // Providers
  // ---------------------------------------------------------------------------

  async function getProvider(provider: PaymentProviderType) {
    try {
      const rows = await db
        .select()
        .from(paymentProviders)
        .where(eq(paymentProviders.provider, provider))
        .limit(1)
        .all();
      return rows[0] ?? null;
    } catch (err) {
      forgeDebug({
        scope: 'payment-receivables',
        level: 'error',
        message: 'getProvider DB read failed',
        context: { provider, error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function upsertProvider(input: {
    provider: PaymentProviderType;
    apiKeyEncrypted: string;
    webhookSecretEncrypted: string;
    isActive: boolean;
    configJson?: Record<string, unknown>;
  }) {
    const now = Date.now();
    try {
      const rows = await db
        .select()
        .from(paymentProviders)
        .where(eq(paymentProviders.provider, input.provider))
        .all();
      if (rows.length > 0) {
        return rows[0].id;
      }
      const id = createId();
      await (db.insert(paymentProviders) as unknown as InsertBuilder<{ id: string }>).values({
        id,
        provider: input.provider,
        apiKeyEncrypted: input.apiKeyEncrypted,
        webhookSecretEncrypted: input.webhookSecretEncrypted,
        isActive: input.isActive,
        configJson: input.configJson ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    } catch (err) {
      forgeDebug({
        scope: 'payment-receivables',
        level: 'error',
        message: 'upsertProvider failed',
        context: {
          provider: input.provider,
          error: errorMsg(err),
        },
      });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Customers
  // ---------------------------------------------------------------------------

  async function upsertCustomer(input: {
    provider: PaymentProviderType;
    providerCustomerId: string;
    email?: string;
    name?: string;
  }) {
    const now = Date.now();
    try {
      const existing = await db
        .select()
        .from(paymentCustomers)
        .where(
          and(
            eq(paymentCustomers.provider, input.provider),
            eq(paymentCustomers.providerCustomerId, input.providerCustomerId),
          ),
        )
        .limit(1)
        .all();

      if (existing.length > 0) {
        await db
          .update(paymentCustomers)
          .set({ email: input.email ?? null, name: input.name ?? null, updatedAt: now })
          .where(eq(paymentCustomers.id, existing[0].id));
        return existing[0].id;
      }
      const [inserted] = await (
        db.insert(paymentCustomers) as unknown as InsertBuilder<{ id: string }>
      )
        .values({
          provider: input.provider,
          providerCustomerId: input.providerCustomerId,
          email: input.email ?? null,
          name: input.name ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: paymentCustomers.id });
      return inserted.id;
    } catch (err) {
      forgeDebug({
        scope: 'payment-receivables',
        level: 'error',
        message: 'upsertCustomer DB read failed',
        context: {
          provider: input.provider,
          providerCustomerId: input.providerCustomerId,
          error: errorMsg(err),
        },
      });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  async function upsertSubscription(input: {
    customerId: string;
    productId: string;
    provider: PaymentProviderType;
    providerSubscriptionId: string;
    status: 'active' | 'cancelled' | 'past_due' | 'trialing' | 'incomplete';
    amountUsd: number;
    billingCycle: 'monthly' | 'annual';
    currentPeriodStart?: number;
    currentPeriodEnd?: number;
    canceledAt?: number;
  }) {
    const now = Date.now();
    try {
      const existing = await db
        .select()
        .from(paymentSubscriptions)
        .where(eq(paymentSubscriptions.providerSubscriptionId, input.providerSubscriptionId))
        .limit(1)
        .all();

      if (existing.length > 0) {
        await db
          .update(paymentSubscriptions)
          .set({
            status: input.status,
            amountUsd: input.amountUsd,
            currentPeriodStart: input.currentPeriodStart ?? null,
            currentPeriodEnd: input.currentPeriodEnd ?? null,
            canceledAt: input.canceledAt ?? null,
            updatedAt: now,
          })
          .where(eq(paymentSubscriptions.providerSubscriptionId, input.providerSubscriptionId));
        return existing[0].id;
      }

      const [inserted] = await (
        db.insert(paymentSubscriptions) as unknown as InsertBuilder<{ id: string }>
      )
        .values({
          customerId: input.customerId,
          productId: input.productId,
          provider: input.provider,
          providerSubscriptionId: input.providerSubscriptionId,
          status: input.status,
          amountUsd: input.amountUsd,
          billingCycle: input.billingCycle,
          currentPeriodStart: input.currentPeriodStart ?? null,
          currentPeriodEnd: input.currentPeriodEnd ?? null,
          canceledAt: input.canceledAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: paymentSubscriptions.id });
      return inserted.id;
    } catch (err) {
      forgeDebug({
        scope: 'payment-receivables',
        level: 'error',
        message: 'upsertSubscription DB read failed',
        context: {
          providerSubscriptionId: input.providerSubscriptionId,
          error: errorMsg(err),
        },
      });
      throw err;
    }
  }

  async function getSubscriptionByProviderId(
    provider: PaymentProviderType,
    providerSubscriptionId: string,
  ) {
    try {
      const rows = await db
        .select()
        .from(paymentSubscriptions)
        .where(
          and(
            eq(paymentSubscriptions.provider, provider),
            eq(paymentSubscriptions.providerSubscriptionId, providerSubscriptionId),
          ),
        )
        .limit(1)
        .all();
      return rows[0] ?? null;
    } catch (err) {
      forgeDebug({
        scope: 'payment-receivables',
        level: 'error',
        message: 'getSubscriptionByProviderId DB read failed',
        context: {
          provider,
          providerSubscriptionId,
          error: errorMsg(err),
        },
      });
      throw err;
    }
  }

  async function listRecentTransactions(provider: PaymentProviderType, limit = 20) {
    try {
      const rows = await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.provider, provider))
        .orderBy(desc(paymentTransactions.createdAt))
        .limit(limit);
      return rows;
    } catch (err) {
      forgeDebug({
        scope: 'payment-receivables',
        level: 'error',
        message: 'listRecentTransactions DB read failed',
        context: { provider, error: errorMsg(err) },
      });
      throw err;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async function getTransactionsBySubscription(subscriptionId: string) {
    try {
      return db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.subscriptionId, subscriptionId));
    } catch (err) {
      forgeDebug({
        scope: 'payment-receivables',
        level: 'error',
        message: 'getTransactionsBySubscription DB read failed',
        context: { subscriptionId, error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function processPaymentEvent(input: {
    provider: PaymentProviderType;
    providerPaymentId: string;
    customerId?: string;
    amountUsd: number;
    status: 'completed' | 'failed' | 'pending' | 'refunded';
    failureReason?: string;
  }) {
    const now = Date.now();
    const txId = createId();
    try {
      const existing = await db
        .select()
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.provider, input.provider),
            eq(paymentTransactions.providerPaymentId, input.providerPaymentId),
          ),
        )
        .limit(1)
        .all();

      if (existing.length > 0) {
        return { id: existing[0].id ?? txId, isNew: false };
      }
      await (db.insert(paymentTransactions) as unknown as InsertBuilder<unknown>).values({
        id: txId,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        customerId: input.customerId ?? null,
        amountUsd: input.amountUsd,
        status: input.status,
        failureReason: input.failureReason ?? null,
        createdAt: now,
        updatedAt: now,
      });

      if (input.status === 'completed') {
        await db.insert(companyCashLedger).values({
          id: createId(),
          type: 'payment_received',
          direction: 'in',
          amountUsd: input.amountUsd,
          description: 'Payment ' + input.providerPaymentId,
          referenceType: 'payment_transaction',
          referenceId: txId,
          status: 'cleared',
          effectiveAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      return { id: txId, isNew: true };
    } catch (err) {
      forgeDebug({
        scope: 'payment-receivables',
        level: 'error',
        message: 'processPaymentEvent failed',
        providerPaymentId: input.providerPaymentId,
        error: errorMsg(err),
      });
      throw err;
    }
  }

  return {
    getProvider,
    upsertProvider,
    upsertCustomer,
    upsertSubscription,
    getSubscriptionByProviderId,
    listRecentTransactions,
    getTransactionsBySubscription,
    processPaymentEvent,
  };
}
