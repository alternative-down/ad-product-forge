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
import { createId } from '../utils/id';


import type {Database} from '../database/schema';
import {
  paymentProviders,
  paymentCustomers,
  paymentSubscriptions,
  paymentTransactions,
  type PaymentProviderType,
} from './payment-schema';
import { companyCashLedger } from '../database/schema';
import { forgeDebug } from '@forge-runtime/core';

export function createPaymentReceivablesStore(db: Database) {
  // ---------------------------------------------------------------------------
  // Providers
  // ---------------------------------------------------------------------------

  async function getProvider(provider: PaymentProviderType) {
    const rows = await db.select().from(paymentProviders).where(eq(paymentProviders.provider, provider)).limit(1);
    return rows[0] ?? null;
    } catch (err) {
    forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to get payment provider', context: { provider, error: err } });
    throw err;
        return existing.id;
      }
      const id = createId();
      await db.insert(paymentProviders).values({
        id,
        provider: input.provider,
        apiKeyEncrypted: input.apiKeyEncrypted,
        webhookSecretEncrypted: input.webhookSecretEncrypted,
        isActive: input.isActive,
        configJson: input.configJson ?? null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to insert payment provider', context: { provider: input.provider, error: err } });
      throw err;
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
    const existing = await db
      .select()
      .from(paymentCustomers)
      .where(
        and(
          eq(paymentCustomers.provider, input.provider),
          eq(paymentCustomers.providerCustomerId, input.providerCustomerId),
        ),
      )
      .limit(1);

    if (existing[0] != null) {
      try {
        await db
          .update(paymentCustomers)
          .set({ email: input.email ?? null, name: input.name ?? null, updatedAt: now })
          .where(eq(paymentCustomers.id, existing[0].id));
      } catch (err) {
        forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to update payment customer', context: { provider: input.provider, providerCustomerId: input.providerCustomerId, error: err } });
        throw err;
      }
      return existing[0].id;
    }
    } catch (err) {
    forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to query payment customer', context: { provider: input.provider, providerCustomerId: input.providerCustomerId, error: err } });
    throw err;
    return id;
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
    const existing = await db
      .select()
      .from(paymentSubscriptions)
      .where(eq(paymentSubscriptions.providerSubscriptionId, input.providerSubscriptionId))
      .limit(1);

    if (existing[0] != null) {
      try {
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
      } catch (err) {
        forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to update subscription', context: { providerSubscriptionId: input.providerSubscriptionId, error: err } });
        throw err;
      }
      return existing[0].id;
    }
    } catch (err) {
    forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to query subscription', context: { providerSubscriptionId: input.providerSubscriptionId, error: err } });
    throw err;
    return id;
  }

  async function getSubscriptionByProviderId(provider: PaymentProviderType, providerSubscriptionId: string) {
    const rows = await db
      .select()
      .from(paymentSubscriptions)
      .where(
        and(
          eq(paymentSubscriptions.provider, provider),
          eq(paymentSubscriptions.providerSubscriptionId, providerSubscriptionId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
    } catch (err) {
    forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to get subscription by provider id', context: { providerSubscriptionId, error: err } });
    throw err;

        if (input.status === 'completed' && tx.ledgerPosted === false) {
           
          const ledgerEntryId = createId();
          await db.transaction(async (tx) => {
            await tx.insert(companyCashLedger).values({
              id: ledgerEntryId,
              type: 'payment_received',
              direction: 'in',
              amountUsd: input.amountUsd,
              description: `Stripe payment ${input.providerPaymentId}`,
              status: 'cleared',
              effectiveAt: now,
              createdAt: now,
            });

            await tx
              .update(paymentTransactions)
              .set({ ledgerEntryId, ledgerPosted: true })
              .where(eq(paymentTransactions.id, tx.id));
          });
        } catch (err) {
          forgeDebug({ scope: 'finance', level: 'error', message: 'Failed to post ledger and update transaction', context: { providerPaymentId: input.providerPaymentId, error: err } });
          throw err;

    const id = createId();
    await db.insert(paymentTransactions).values({
      id,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      providerSubscriptionId: input.providerSubscriptionId ?? null,
      status: input.status,
      amountUsd: input.amountUsd,
      currency: input.currency,
      customerEmail: input.customerEmail ?? null,
      ledgerEntryId: null,
      ledgerPosted: false,
      paidAt: input.paidAt ?? null,
      createdAt: now,
      updatedAt: now,
    });
    } catch (err) {
    forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to insert transaction', context: { providerPaymentId: input.providerPaymentId, error: err } });
    throw err;
    }

    return { id, isNew: true, ledgerPosted: input.status === 'completed' };
  }

  async function listRecentTransactions(provider: PaymentProviderType, limit = 20) {
    const rows = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.provider, provider))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(limit);
    return rows;
    } catch (err) {
    forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to list recent transactions', context: { provider, error: err } });
    throw err;
  }

  async function getTransactionsBySubscription(subscriptionId: string) {
    try {
      return await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.subscriptionId, subscriptionId));
    } catch (err) {
      forgeDebug({ scope: 'finance', level: 'info', message: 'Failed to get transactions by subscription', context: { subscriptionId, error: err } });
      throw err;
    }
  }

  return {
    getProvider,
    upsertProvider,
    upsertCustomer,
    upsertSubscription,
    getSubscriptionByProviderId,
    processPaymentEvent,
    listRecentTransactions,
    getTransactionByProviderId,
    getTransactionsBySubscription,
  };
}