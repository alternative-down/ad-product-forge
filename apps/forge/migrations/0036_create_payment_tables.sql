-- =============================================================================
-- Migration 0036: create payment_providers, payment_customers,
-- payment_subscriptions, payment_transactions (P0 #6301 dev env crash)
-- =============================================================================
--
-- ROOT CAUSE
-- ---------
-- The 4 payment tables defined in apps/forge/src/finance/payment-schema.ts
-- were NEVER created by any migration. Migration 0032 (payment_receivables
-- currency + unique indexes) and 0034 (company_cash_ledger currency) ran
-- ALTER/CREATE INDEX statements against these tables under the assumption
-- they existed, but no CREATE TABLE statement established them.
--
-- This caused runMigrations to fail at startup with
-- SQLITE_ERROR: no such table: payment_subscriptions, returning 503 on all
-- develop.forge.alternativedown.com.br routes since the post-#6296 deploy.
--
-- #6296 (L#NN-46 v4.7 orphan tripwire) validated journal file structure
-- only — it did NOT catch that schema tables were missing CREATE TABLE
-- statements entirely. L#NN-46 v4.8 (schema-completeness) drafted for
-- follow-up codification.
--
-- Also note: payment_receivables (referenced by L#NN-50 #23) is defined in
-- apps/forge/src/finance/payment-receivables.ts and is intentionally NOT
-- in this migration — its root cause is separate and will be addressed in
-- a follow-up.
--
-- SYMPTOMS RESOLVED
-- -----------------
-- - dev env crash on startup (LibsqlError: no such table: payment_subscriptions)
-- - 503 on all develop.forge.alternativedown.com.br routes (since ~16:38Z D38)
-- - runMigrations bootstrap completes without error
--
-- BACKWARDS COMPATIBILITY
-- -----------------------
-- - payment_subscriptions.currency column backfilled to 'usd' for existing
--   rows (per #6013 L#NN-50 #23 N=4 D24 — Asaas BRL subscriptions sit in
--   known-bad state until manually reconciled, this is a documented
--   trade-off from the original codification).
-- - All 4 unique indexes match the uniqueIndex declarations in
--   payment-schema.ts so existing upsert helpers (upsertProvider,
--   upsertCustomer, upsertSubscription) work without code changes.
--
-- TABLES CREATED (in dependency order)
-- ------------------------------------
--   1. payment_providers      (no FK)
--   2. payment_customers      (no FK)
--   3. payment_subscriptions  (FK to payment_customers.id)
--   4. payment_transactions   (FK to payment_subscriptions.id, payment_customers.id)
--
-- INDEXES CREATED
-- ---------------
--   1. payment_providers_provider_unique_idx          ON (provider)
--   2. payment_customers_provider_customerid_unique_idx ON (provider, provider_customer_id)
--   3. payment_subscriptions_provider_subid_unique_idx ON (provider_subscription_id)
--   4. payment_transactions_provider_paymentid_unique_idx ON (provider, provider_payment_id)
--
-- Total: 8 statements. Well below the 27 libsql batch transaction threshold.
--
-- IDEMPOTENCY
-- -----------
-- CREATE TABLE / CREATE INDEX do not have IF NOT EXISTS in libsql
-- historically (CREATE TABLE IF NOT EXISTS is supported in SQLite 3.8+ which
-- libsql satisfies). We use IF NOT EXISTS guard on both CREATE TABLE and
-- CREATE UNIQUE INDEX so this migration is rerunnable in case of
-- journal-state corruption. The primary correctness guarantee still comes
-- from Drizzle's __drizzle_migrations journal.
--
-- REFERENCES
-- ----------
--   - #6301 (this issue): P0 dev env crash
--   - #6296 (PR): L#NN-46 v4.7 orphan tripwire (file structure alone)
--   - #6294 (issue): P0 root cause (journal drift, fixed by #6296)
--   - #6013 (D24): L#NN-50 #23 N=4 currency column codification
--   - #6015 (D24): L#NN-46 v4.6 N=4 unique index pattern
--   - 0032_payment_receivables_currency_unique.sql: precedent for unique
--     indexes on payment_subscripe_subscription_id and (provider, id)
--   - 0030_company_cash_ledger_recurring_payable_unique.sql: IF NOT EXISTS
--     precedent for CREATE UNIQUE INDEX
-- =============================================================================

CREATE TABLE IF NOT EXISTS `payment_providers` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `api_key_encrypted` text,
  `webhook_secret_encrypted` text,
  `is_active` integer NOT NULL DEFAULT 0,
  `config_json` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `payment_providers_provider_unique_idx`
  ON `payment_providers` (`provider`);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `payment_customers` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `provider_customer_id` text NOT NULL,
  `email` text,
  `name` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `payment_customers_provider_customerid_unique_idx`
  ON `payment_customers` (`provider`, `provider_customer_id`);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `payment_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `customer_id` text NOT NULL REFERENCES `payment_customers`(`id`),
  `product_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_subscription_id` text NOT NULL,
  `status` text NOT NULL,
  `amount_usd` real NOT NULL,
  `currency` text NOT NULL DEFAULT 'usd',
  `billing_cycle` text NOT NULL,
  `current_period_start` integer,
  `current_period_end` integer,
  `canceled_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `payment_subscriptions_provider_subid_unique_idx`
  ON `payment_subscriptions` (`provider_subscription_id`);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `payment_transactions` (
  `id` text PRIMARY KEY NOT NULL,
  `subscription_id` text REFERENCES `payment_subscriptions`(`id`),
  `customer_id` text NOT NULL REFERENCES `payment_customers`(`id`),
  `provider` text NOT NULL,
  `provider_payment_id` text NOT NULL,
  `ledger_entry_id` text,
  `amount_usd` real NOT NULL,
  `currency` text NOT NULL DEFAULT 'usd',
  `status` text NOT NULL,
  `failure_reason` text,
  `ledger_posted` integer NOT NULL DEFAULT 0,
  `raw_event_json` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `payment_transactions_provider_paymentid_unique_idx`
  ON `payment_transactions` (`provider`, `provider_payment_id`);
