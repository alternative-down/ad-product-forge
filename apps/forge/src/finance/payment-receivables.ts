/**
 * Payment Receivables Store — handles Stripe/Asaas payment transactions.
 *
 * Design principles:
 * - Every confirmed payment creates one ledger entry, exactly once (idempotency by providerPaymentId)
 * - Failed payments are tracked without posting to the ledger
 * - All state transitions are explicit and auditable
 * - All DB operations wrapped with withDbErrorLogging (Format A — see
 *   apps/forge/src/database/error-logging.ts) for unified error logging.
 */

import { eq, and, desc } from 'drizzle-orm';
import { withDbErrorLogging } from '../database/error-logging';
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

interface InsertBuilder<T> {
  values<V extends Record<string, unknown>>(v: V): InsertBuilder<T>;
  returning<C extends Record<string, unknown>>(cols: C): Promise<{ [K in keyof C]: unknown }[]>;
}

export function createPaymentReceivablesStore(db: Database) {
  // ---------------------------------------------------------------------------
  // Providers
  // ---------------------------------------------------------------------------

  async function getProvider(provider: PaymentProviderType) {
    return await withDbErrorLogging({
      scope: 'payment-receivables',
      op: 'getProvider',
      verb: 'read',
      context: { provider },
      fn: () =>
        db
          .select()
          .from(paymentProviders)
          .where(eq(paymentProviders.provider, provider))
          .limit(1)
          .all(),
    }).then((rows) => rows[0] ?? null);
  }

  async function upsertProvider(input: {
    provider: PaymentProviderType;
    apiKeyEncrypted: string;
    webhookSecretEncrypted: string;
    isActive: boolean;
    configJson?: Record<string, unknown>;
  }) {
    const now = Date.now();
    return await withDbErrorLogging({
      scope: 'payment-receivables',
      op: 'upsertProvider',
      verb: 'write',
      context: { provider: input.provider },
      fn: async () => {
        const rows = await db
          .select()
          .from(paymentProviders)
          .where(eq(paymentProviders.provider, input.provider))
          .all();
        if (rows.length > 0) {
          // L#19 fix (closes #5637): the previous code returned the existing
          // id without updating any fields, so callers rotating apiKeyEncrypted
          // or toggling isActive saw their changes silently dropped. We now
          // UPDATE all the upsertable fields, mirroring upsertCustomer's
          // SELECT-then-UPDATE pattern.
          await db
            .update(paymentProviders)
            .set({
              apiKeyEncrypted: input.apiKeyEncrypted,
              webhookSecretEncrypted: input.webhookSecretEncrypted,
              isActive: input.isActive ? 1 : 0,
              configJson: input.configJson ? JSON.stringify(input.configJson) : null,
              updatedAt: now,
            })
            .where(eq(paymentProviders.id, rows[0].id));
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
      },
    });
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
    return await withDbErrorLogging({
      scope: 'payment-receivables',
      op: 'upsertCustomer',
      verb: 'write',
      context: {
        provider: input.provider,
        providerCustomerId: input.providerCustomerId,
      },
      fn: async () => {
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
          // Closes #5543 (data-loss overwrite): preserve existing email/name
          // when the caller passes undefined, instead of silently nulling them.
          await db
            .update(paymentCustomers)
            .set({
              email: input.email ?? existing[0].email ?? null,
              name: input.name ?? existing[0].name ?? null,
              updatedAt: now,
            })
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
      },
    });
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
    return await withDbErrorLogging({
      scope: 'payment-receivables',
      op: 'upsertSubscription',
      verb: 'write',
      context: { providerSubscriptionId: input.providerSubscriptionId },
      fn: async () => {
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
      },
    });
  }

  async function getSubscriptionByProviderId(
    provider: PaymentProviderType,
    providerSubscriptionId: string,
  ) {
    return await withDbErrorLogging({
      scope: 'payment-receivables',
      op: 'getSubscriptionByProviderId',
      verb: 'read',
      context: { provider, providerSubscriptionId },
      fn: () =>
        db
          .select()
          .from(paymentSubscriptions)
          .where(
            and(
              eq(paymentSubscriptions.provider, provider),
              eq(paymentSubscriptions.providerSubscriptionId, providerSubscriptionId),
            ),
          )
          .limit(1)
          .all(),
    }).then((rows) => rows[0] ?? null);
  }

  async function listRecentTransactions(provider: PaymentProviderType, limit = 20) {
    return await withDbErrorLogging({
      scope: 'payment-receivables',
      op: 'listRecentTransactions',
      verb: 'read',
      context: { provider },
      fn: () =>
        db
          .select()
          .from(paymentTransactions)
          .where(eq(paymentTransactions.provider, provider))
          .orderBy(desc(paymentTransactions.createdAt))
          .limit(limit),
    });
  }
  async function getTransactionsBySubscription(subscriptionId: string) {
    return await withDbErrorLogging({
      scope: 'payment-receivables',
      op: 'getTransactionsBySubscription',
      verb: 'read',
      context: { subscriptionId },
      fn: () =>
        db.select().from(paymentTransactions).where(eq(paymentTransactions.subscriptionId, subscriptionId)),
    });
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
    return await withDbErrorLogging({
      scope: 'payment-receivables',
      op: 'processPaymentEvent',
      verb: 'write',
      context: { provider: input.provider, providerPaymentId: input.providerPaymentId },
      fn: () => {
        // Closes #5540 (race) and #5541 (no transaction wrapper):
        // - SQLite serializes writes within a transaction; concurrent events queue
        //   so the second findFirst sees the first's insert
        // - tx insert + ledger insert are now atomic — if either fails, both roll back
        return db.transaction(async (tx) => {
          const existing = await tx
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
          await (tx.insert(paymentTransactions) as unknown as InsertBuilder<unknown>).values({
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
            // Closes #5539 (status enum mismatch):
            // - CompanyCashStatus = 'planned' | 'posted' | 'canceled'
            // - 'cleared' is NOT a valid enum value, so the entry was invisible to getCurrentBalanceUsd
            //   (which only sums 'posted' entries)
            // - This was a silent accounting bug: payments entered the DB but balance = 0
            await tx.insert(companyCashLedger).values({
              id: createId(),
              type: 'payment_received',
              direction: 'in',
              amountUsd: input.amountUsd,
              description: 'Payment ' + input.providerPaymentId,
              referenceType: 'payment_transaction',
              referenceId: txId,
              status: 'posted',
              effectiveAt: now,
              createdAt: now,
              updatedAt: now,
            });
          }

          return { id: txId, isNew: true };
        });
      },
    });
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
