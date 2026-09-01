/**
 * Payment providers and accounts receivable data model.
 * Covers Stripe and Asaas payment integration.
 */

import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

// =============================================================================
// Payment Providers
// =============================================================================

export const paymentProviders = sqliteTable(
  'payment_providers',
  {
    id: text('id').primaryKey(),
    provider: text('provider', { enum: ['stripe', 'asaas'] }).notNull(),
    /** Encrypted API key */
    apiKeyEncrypted: text('api_key_encrypted'),
    /** Encrypted webhook secret */
    webhookSecretEncrypted: text('webhook_secret_encrypted'),
    /** Whether the provider is enabled */
    isActive: integer('is_active').notNull().default(0),
    /** Arbitrary provider-specific config as JSON string */
    configJson: text('config_json'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    // #6015 L#NN-46 v4.6 N=4 — unique index on `provider` for upsertProvider.
    // Same IF NOT EXISTS pattern as 0030_company_cash_ledger_recurring_payable_unique.
    paymentProvidersProviderUniqueIdx: uniqueIndex('payment_providers_provider_unique_idx').on(
      table.provider,
    ),
  }),
);

export type PaymentProviderType = 'stripe' | 'asaas';

// =============================================================================
// Payment Customers
// =============================================================================

export const paymentCustomers = sqliteTable(
  'payment_customers',
  {
    id: text('id').primaryKey(),
    provider: text('provider', { enum: ['stripe', 'asaas'] }).notNull(),
    providerCustomerId: text('provider_customer_id').notNull(),
    email: text('email'),
    name: text('name'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    // #6015 L#NN-46 v4.6 N=4 — composite unique index on (provider, provider_customer_id)
    // for upsertCustomer. Mirrors pattern from 0026_webhook_idempotency_unique.
    paymentCustomersProviderCustomeridUniqueIdx: uniqueIndex(
      'payment_customers_provider_customerid_unique_idx',
    ).on(table.provider, table.providerCustomerId),
  }),
);

// =============================================================================
// Payment Subscriptions
// =============================================================================

export const paymentSubscriptions = sqliteTable(
  'payment_subscriptions',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => paymentCustomers.id),
    productId: text('product_id').notNull(),
    provider: text('provider', { enum: ['stripe', 'asaas'] }).notNull(),
    providerSubscriptionId: text('provider_subscription_id').notNull(),
    status: text('status', {
      enum: ['active', 'cancelled', 'past_due', 'trialing', 'incomplete'],
    }).notNull(),
    amountUsd: real('amount_usd').notNull(),
    /**
     * Currency of `amountUsd` — 'usd' for Stripe, 'brl' for Asaas.
     * #6013 L#NN-50 #23 N=4 — without this column, the same `amountUsd`
     * field was used for both currencies, producing silent financial
     * reporting corruption. Backfilled to 'usd' for existing rows
     * (acknowledge known-bad state for Asaas subscriptions).
     */
    currency: text('currency').notNull().default('usd'),
    billingCycle: text('billing_cycle', { enum: ['monthly', 'annual'] }).notNull(),
    currentPeriodStart: integer('current_period_start'),
    currentPeriodEnd: integer('current_period_end'),
    canceledAt: integer('canceled_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    // #6015 L#NN-46 v4.6 N=4 — unique index on provider_subscription_id
    // for upsertSubscription. Note: provider+providerSubscriptionId would be
    // over-constrained since providerSubscriptionId is already globally
    // unique per provider contract.
    paymentSubscriptionsProviderSubidUniqueIdx: uniqueIndex(
      'payment_subscriptions_provider_subid_unique_idx',
    ).on(table.providerSubscriptionId),
  }),
);

// =============================================================================
// Payment Transactions
// =============================================================================

export const paymentTransactions = sqliteTable(
  'payment_transactions',
  {
    id: text('id').primaryKey(),
    subscriptionId: text('subscription_id').references(() => paymentSubscriptions.id),
    customerId: text('customer_id')
      .notNull()
      .references(() => paymentCustomers.id),
    provider: text('provider', { enum: ['stripe', 'asaas'] }).notNull(),
    /** The raw provider payment/checkout event ID — used for idempotency */
    providerPaymentId: text('provider_payment_id').notNull(),
    /** Internal ledger entry ID — null until confirmed */
    ledgerEntryId: text('ledger_entry_id'),
    amountUsd: real('amount_usd').notNull(),
    currency: text('currency').notNull().default('usd'),
    status: text('status', { enum: ['pending', 'completed', 'failed', 'refunded'] }).notNull(),
    failureReason: text('failure_reason'),
    /** Whether this transaction has already been posted to the ledger */
    ledgerPosted: integer('ledger_posted').notNull().default(0),
    rawEventJson: text('raw_event_json'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    // #6015 L#NN-46 v4.6 N=4 — composite unique index on
    // (provider, provider_payment_id) for processPaymentEvent idempotency.
    // The application layer already checks findFirst first, but this is
    // defense-in-depth at the schema level (same pattern as 0026 webhook
    // idempotency_unique).
    paymentTransactionsProviderPaymentidUniqueIdx: uniqueIndex(
      'payment_transactions_provider_paymentid_unique_idx',
    ).on(table.provider, table.providerPaymentId),
  }),
);