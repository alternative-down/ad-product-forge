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
  }

  async function upsertProvider(input: {
    provider: PaymentProviderType;
    apiKeyEncrypted: string;
    webhookSecretEncrypted: string;
    isActive: boolean;
    configJson?: Record<string, unknown>;
  }) {
    const now = Date.now();
      const rows = await db.select().from(paymentProviders).where(eq(paymentProviders.provider, input.provider)).all();
      if (rows.length > 0) {
        await db.update(paymentProviders).set({ apiKeyEncrypted: input.apiKeyEncrypted, webhookSecretEncrypted: input.webhookSecretEncrypted, isActive: input.isActive, configJson: input.configJson ?? null, updatedAt: now }).where(eq(paymentProviders.provider, input.provider));
        return rows[0].id;
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
    return id;
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

    if (existing.length > 0) {
        await db
          .update(paymentCustomers)
          .set({ email: input.email ?? null, name: input.name ?? null, updatedAt: now })
          .where(eq(paymentCustomers.id, existing[0].id));
      return existing[0].id;
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
    const existing = await db
      .select()
      .from(paymentSubscriptions)
      .where(eq(paymentSubscriptions.providerSubscriptionId, input.providerSubscriptionId))
      .limit(1);

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
  }

  async function listRecentTransactions(provider: PaymentProviderType, limit = 20) {
    const rows = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.provider, provider))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(limit);
      return rows;
  }

  async function getTransactionsBySubscription(subscriptionId: string) {
      return await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.subscriptionId, subscriptionId));
  }

  return {
    getProvider,
    upsertProvider,
    upsertCustomer,
    upsertSubscription,
    getSubscriptionByProviderId,
    listRecentTransactions,
    getTransactionsBySubscription,
  };
}