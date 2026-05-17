/**
 * Payment providers and accounts receivable data model.
 * Covers Stripe and Asaas payment integration.
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// =============================================================================
// Payment Providers
// =============================================================================

export const paymentProviders = sqliteTable('payment_providers', {
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
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type PaymentProviderType = 'stripe' | 'asaas';

// =============================================================================
// Payment Customers
// =============================================================================

export const paymentCustomers = sqliteTable('payment_customers', {
  id: text('id').primaryKey(),
  provider: text('provider', { enum: ['stripe', 'asaas'] }).notNull(),
  providerCustomerId: text('provider_customer_id').notNull(),
  email: text('email'),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// =============================================================================
// Payment Subscriptions
// =============================================================================

export const paymentSubscriptions = sqliteTable('payment_subscriptions', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => paymentCustomers.id),
  productId: text('product_id').notNull(),
  provider: text('provider', { enum: ['stripe', 'asaas'] }).notNull(),
  providerSubscriptionId: text('provider_subscription_id').notNull(),
  status: text('status', { enum: ['active', 'cancelled', 'past_due', 'trialing', 'incomplete'] }).notNull(),
  amountUsd: real('amount_usd').notNull(),
  billingCycle: text('billing_cycle', { enum: ['monthly', 'annual'] }).notNull(),
  currentPeriodStart: integer('current_period_start', { mode: 'timestamp_ms' }),
  currentPeriodEnd: integer('current_period_end', { mode: 'timestamp_ms' }),
  canceledAt: integer('canceled_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// =============================================================================
// Payment Transactions
// =============================================================================

export const paymentTransactions = sqliteTable('payment_transactions', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').references(() => paymentSubscriptions.id),
  customerId: text('customer_id').notNull().references(() => paymentCustomers.id),
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
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
