/**
 * Payment Receivables Store — handles Stripe/Asaas payment transactions.
 *
 * Design principles:
 * - Every confirmed payment creates one ledger entry, exactly once (idempotency by providerPaymentId)
 * - Failed payments are tracked without posting to the ledger
 * - All state transitions are explicit and auditable
 */

import { eq, and } from 'drizzle-orm';
import { createId } from '../utils/id';

import type { Database } from '../database/index';
import {
  paymentProviders,
  paymentCustomers,
  paymentSubscriptions,
  paymentTransactions,
  type PaymentProviderType,
} from './payment-schema';
import { companyCashLedger } from '../database/schema';

export function createPaymentReceivablesStore(db: Database) {
  // ---------------------------------------------------------------------------
  // Providers
  // ---------------------------------------------------------------------------

  async function getProvider(provider: PaymentProviderType) {
    // Use query helper for test compatibility (same pattern as company-cash-operations)
    const rows = await db.select().from(paymentProviders).where(eq(paymentProviders.provider, provider)).limit(1);
    return rows[0] ?? null;
  }

  async function upsertProvider(input: {
    provider: PaymentProviderType;
    apiKeyEncrypted: string;
    webhookSecretEncrypted: string;
    isActive: boolean;
    configJson?: string;
  }) {
    const now = Date.now();
    const existing = await getProvider(input.provider);
    if (existing) {
      await db
        .update(paymentProviders)
        .set({
          apiKeyEncrypted: input.apiKeyEncrypted,
          webhookSecretEncrypted: input.webhookSecretEncrypted,
          isActive: input.isActive,
          configJson: input.configJson ?? null,
          updatedAt: now,
        })
        .where(eq(paymentProviders.provider, input.provider));
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

    if (existing[0]) {
      await db
        .update(paymentCustomers)
        .set({ email: input.email ?? null, name: input.name ?? null, updatedAt: now })
        .where(eq(paymentCustomers.id, existing[0].id));
      return existing[0].id;
    }

    const id = createId();
    await db.insert(paymentCustomers).values({
      id,
      provider: input.provider,
      providerCustomerId: input.providerCustomerId,
      email: input.email ?? null,
      name: input.name ?? null,
      createdAt: now,
      updatedAt: now,
    });
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

    if (existing[0]) {
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
        .where(eq(paymentSubscriptions.id, existing[0].id));
      return existing[0].id;
    }

    const id = createId();
    await db.insert(paymentSubscriptions).values({
      id,
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
    });
    return id;
  }

  async function getSubscriptionByProviderId(providerSubscriptionId: string) {
    const rows = await db.select().from(paymentSubscriptions).where(eq(paymentSubscriptions.providerSubscriptionId, providerSubscriptionId)).limit(1);
    return rows[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Transactions — core idempotency guarantee
  // ---------------------------------------------------------------------------

  /**
   * Process a payment event from a provider webhook.
   * Idempotent: if providerPaymentId already exists, returns the existing record.
   * For 'completed' status, posts to the company cash ledger exactly once.
   */
  async function processPaymentEvent(input: {
    provider: PaymentProviderType;
    providerPaymentId: string;
    subscriptionId?: string;
    customerId: string;
    amountUsd: number;
    currency?: string;
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    failureReason?: string;
    rawEventJson?: string;
  }) {
    const now = Date.now();

    // Check idempotency — return existing record if already processed
    const existing = await db
      .select()
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.provider, input.provider),
          eq(paymentTransactions.providerPaymentId, input.providerPaymentId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      return { id: existing[0].id, isNew: false, ledgerPosted: existing[0].ledgerPosted };
    }

    // Insert new transaction record
    const id = createId();
    await db.insert(paymentTransactions).values({
      id,
      subscriptionId: input.subscriptionId ?? null,
      customerId: input.customerId,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      ledgerEntryId: null,
      amountUsd: input.amountUsd,
      currency: input.currency ?? 'usd',
      status: input.status,
      failureReason: input.failureReason ?? null,
      ledgerPosted: false,
      rawEventJson: input.rawEventJson ?? null,
      createdAt: now,
      updatedAt: now,
    });

    // If completed, post revenue to the company cash ledger exactly once
    if (input.status === 'completed') {
      const ledgerId = createId();
      await db.insert(companyCashLedger).values({
        id: ledgerId,
        type: 'payment_received',
        direction: 'in',
        amountUsd: input.amountUsd,
        description: `Payment received via ${input.provider} (${input.providerPaymentId})`,
        referenceType: 'payment_transaction',
        referenceId: id,
        status: 'posted',
        effectiveAt: now,
        dueAt: now,
      });

      await db
        .update(paymentTransactions)
        .set({ ledgerEntryId: ledgerId, ledgerPosted: true, updatedAt: now })
        .where(eq(paymentTransactions.id, id));
    }

    return { id, isNew: true, ledgerPosted: input.status === 'completed' };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async function listRecentTransactions(limit = 20) {
    const rows = await db
      .select()
      .from(paymentTransactions)
      .orderBy(paymentTransactions.createdAt)
      .limit(limit);
    return rows;
  }

  async function getTransactionByProviderId(provider: PaymentProviderType, providerPaymentId: string) {
    const rows = await db.select().from(paymentTransactions).where(
      and(eq(paymentTransactions.provider, provider), eq(paymentTransactions.providerPaymentId, providerPaymentId))
    ).limit(1);
    return rows[0] ?? null;
  }

  async function getTransactionsBySubscription(subscriptionId: string) {
    return db
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
    processPaymentEvent,
    listRecentTransactions,
    getTransactionByProviderId,
    getTransactionsBySubscription,
  };
}
