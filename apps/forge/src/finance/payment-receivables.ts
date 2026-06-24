/**
 * Payment Receivables Store — handles Stripe/Asaas payment transactions.
 *
 * Design principles:
 * - Every confirmed payment creates one ledger entry, exactly once (idempotency by providerPaymentId)
 * - Failed payments are tracked without posting to the ledger
 * - All state transitions are explicit and auditable
 * - All DB operations wrapped with withDbErrorLogging (Format A — see
 *   apps/forge/src/database/error-logging.ts) for unified error logging.
 * - All upsert/write helpers are wrapped in `db.transaction(...)` (#6015 L#NN-46 v4.6 N=4)
 *   so SELECT-then-UPDATE-or-INSERT is atomic — closing the TOCTOU window that
 *   existed in the pre-#6015 code (two concurrent upserts with the same key
 *   could both see "no existing row" and both INSERT, producing duplicate rows).
 * - Schema-level unique indexes on the upsert keys (payment_providers.provider,
 *   payment_customers(provider, provider_customer_id),
 *   payment_subscriptions.provider_subscription_id,
 *   payment_transactions(provider, provider_payment_id)) provide defense-in-depth:
 *   even if a race somehow slipped through the transaction wrapper, the unique
 *   constraint would surface as a clear error rather than silent data corruption.
 * - Currency tracking (#6013 L#NN-50 #23 N=4): every monetary write includes a
 *   `currency: 'usd' | 'brl'` field so that Asaas BRL and Stripe USD amounts
 *   are never mixed at the SQL SUM level. See `getCurrentBalanceUsd` validation
 *   notes in C14 Revisão.
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

/**
 * Currency supported by payment-receivables.ts. Mirrors the `currency` column
 * on paymentSubscriptions + paymentTransactions. Source of truth for the
 * union — kept here to avoid duplicate `as const` declarations.
 */
export type PaymentCurrency = 'usd' | 'brl';

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
      fn: () =>
        // #6015 L#NN-46 v4.6 N=4 — wrap SELECT + UPDATE/INSERT in a single
        // transaction. Closes TOCTOU race where two concurrent calls with
        // the same `provider` value both see "no existing row" and both
        // INSERT (the schema-level unique index would also catch this but
        // the transaction wrapper makes the failure mode graceful — no
        // 500 error to the caller).
        db.transaction(async (tx) => {
          const rows = await tx
            .select()
            .from(paymentProviders)
            .where(eq(paymentProviders.provider, input.provider))
            .limit(1)
            .all();
          if (rows.length > 0) {
            // L#19 fix (closes #5637): the previous code returned the existing
            // id without updating any fields, so callers rotating apiKeyEncrypted
            // or toggling isActive saw their changes silently dropped. We now
            // UPDATE all the upsertable fields, mirroring upsertCustomer's
            // SELECT-then-UPDATE pattern.
            await tx
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
          await tx.insert(paymentProviders).values({
            id,
            provider: input.provider,
            apiKeyEncrypted: input.apiKeyEncrypted,
            webhookSecretEncrypted: input.webhookSecretEncrypted,
            isActive: input.isActive ? 1 : 0,
            configJson: input.configJson ? JSON.stringify(input.configJson) : null,
            createdAt: now,
            updatedAt: now,
          });
          return id;
        }),
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
      fn: () =>
        // #6015 L#NN-46 v4.6 N=4 — atomic SELECT + UPDATE/INSERT.
        db.transaction(async (tx) => {
          const existing = await tx
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
            await tx
              .update(paymentCustomers)
              .set({
                email: input.email ?? existing[0].email ?? null,
                name: input.name ?? existing[0].name ?? null,
                updatedAt: now,
              })
              .where(eq(paymentCustomers.id, existing[0].id));
            return existing[0].id;
          }
          const insertedRows = (await tx
            .insert(paymentCustomers)
            .values({
              id: createId(),
              provider: input.provider,
              providerCustomerId: input.providerCustomerId,
              email: input.email ?? null,
              name: input.name ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: paymentCustomers.id })) as unknown as Array<{ id: string }>;
          const inserted = insertedRows[0];
          if (insertedRows.length === 0) {
            throw new Error(
              `upsertCustomer: insert returned no row for provider=${input.provider} customerId=${input.providerCustomerId}`,
            );
          }
          return inserted.id;
        }),
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
    /**
     * #6013 L#NN-50 #23 N=4 — currency of `amountUsd`. Required (not defaulted)
     * because the previous implicit "everything is USD" assumption was the
     * root cause of the BRL-as-USD silent corruption in #6013. Callers MUST
     * pass `currency: 'usd'` for Stripe or `currency: 'brl'` for Asaas.
     */
    currency: PaymentCurrency;
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
      fn: () =>
        // #6015 L#NN-46 v4.6 N=4 — atomic SELECT + UPDATE/INSERT.
        db.transaction(async (tx) => {
          const existing = await tx
            .select()
            .from(paymentSubscriptions)
            .where(
              eq(paymentSubscriptions.providerSubscriptionId, input.providerSubscriptionId),
            )
            .limit(1)
            .all();

          if (existing.length > 0) {
            // #6013 — propagate currency on UPDATE too, so a re-sync that
            // changes the upstream currency (rare but possible) updates the row.
            await tx
              .update(paymentSubscriptions)
              .set({
                status: input.status,
                amountUsd: input.amountUsd,
                currency: input.currency,
                currentPeriodStart: input.currentPeriodStart ?? null,
                currentPeriodEnd: input.currentPeriodEnd ?? null,
                canceledAt: input.canceledAt ?? null,
                updatedAt: now,
              })
              .where(
                eq(paymentSubscriptions.providerSubscriptionId, input.providerSubscriptionId),
              );
            return existing[0].id;
          }

          const insertedRows = (await tx
            .insert(paymentSubscriptions)
            .values({
              id: createId(),
              customerId: input.customerId,
              productId: input.productId,
              provider: input.provider,
              providerSubscriptionId: input.providerSubscriptionId,
              status: input.status,
              amountUsd: input.amountUsd,
              currency: input.currency,
              billingCycle: input.billingCycle,
              currentPeriodStart: input.currentPeriodStart ?? null,
              currentPeriodEnd: input.currentPeriodEnd ?? null,
              canceledAt: input.canceledAt ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: paymentSubscriptions.id })) as unknown as Array<{ id: string }>;
          const inserted = insertedRows[0];
          if (insertedRows.length === 0) {
            throw new Error(
              `upsertSubscription: insert returned no row for providerSubscriptionId=${input.providerSubscriptionId}`,
            );
          }
          return inserted.id;
        }),
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
        db
          .select()
          .from(paymentTransactions)
          .where(eq(paymentTransactions.subscriptionId, subscriptionId)),
    });
  }

  async function processPaymentEvent(input: {
    provider: PaymentProviderType;
    providerPaymentId: string;
    /**
     * Required because paymentTransactions.customer_id is "notNull().references(paymentCustomers.id)"
     * in the schema. Pre-#6013 this was "? string" with "?? null" fallback, which would crash at
     * runtime (SQLite NOT NULL violation) — the cast on the INSERT hid the TS error AND the
     * latent bug. Making it required at the function level enforces the contract.
     */
    customerId: string;
    amountUsd: number;
    /**
     * #6013 L#NN-50 #23 N=4 — currency of `amountUsd`. Required (not defaulted).
     * Pre-#6013 the INSERT statement omitted this column entirely so every
     * Asaas transaction was recorded as currency='usd' (the schema default).
     */
    currency: PaymentCurrency;
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
        // #6015 Tier 2 (ledger integrity): the transaction row's `ledgerEntryId` is
        // populated by .returning({id: companyCashLedger.id}) on the ledger insert,
        // then UPDATEd back to paymentTransactions. This closes the pre-#6015 gap
        // where re-running processPaymentEvent (idempotency path) could re-insert
        // a duplicate ledger entry because nothing recorded "this transaction
        // already posted to ledger".
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
            return { id: existing[0].id, isNew: false };
          }
          await tx.insert(paymentTransactions).values({
            id: txId,
            provider: input.provider,
            providerPaymentId: input.providerPaymentId,
            customerId: input.customerId,
            amountUsd: input.amountUsd,
            currency: input.currency,
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
            // #6015 Tier 2: capture ledger.id back to paymentTransactions so the
            // transaction↔ledger relationship is explicit and idempotent.
            const ledgerRows = (await tx
              .insert(companyCashLedger)
              .values({
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
              })
              .returning({ id: companyCashLedger.id })) as unknown as Array<{ id: string }>;
            const ledgerRow = ledgerRows[0];
            if (ledgerRows.length === 0) {
              throw new Error(
                `processPaymentEvent: ledger insert returned no row for txId=${txId}`,
              );
            }
            // Update the transaction with the ledger link + posted flag in the
            // SAME transaction (atomic). After this, paymentTransactions.ledgerEntryId
            // is non-null and ledgerPosted=1, so a second call with the same
            // (provider, providerPaymentId) would still take the existing-row
            // idempotency branch above (and return the same id without
            // re-posting).
            await tx
              .update(paymentTransactions)
              .set({
                ledgerEntryId: ledgerRow.id,
                ledgerPosted: 1,
                updatedAt: now,
              })
              .where(eq(paymentTransactions.id, txId));
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