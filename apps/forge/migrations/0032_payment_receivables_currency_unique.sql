-- =============================================================================
-- Migration 0032: payment_receivables currency column + unique indexes
-- (L#NN-50 #23 N=4 + L#NN-46 v4.6 N=4 — Day 24 finance cluster #6013 #6015)
-- =============================================================================
--
-- ROOT CAUSE
-- ---------
-- 1) payment_subscriptions.amountUsd was a currency-agnostic real column that
--    received BRL from Asaas and USD from Stripe into the same field — no
--    way to tell them apart at query time. Combined with the same pattern on
--    payment_transactions (where the `currency` column exists in schema but
--    was NEVER populated in code), this created silent financial reporting
--    corruption: every Asaas subscription stored its BRL amount under a USD
--    field name.
--
-- 2) The upsert helpers in payment-receivables.ts (upsertProvider,
--    upsertCustomer, upsertSubscription) used SELECT-then-INSERT-or-UPDATE
--    WITHOUT a unique constraint on the lookup key. SQLite would either:
--    (a) race on the SELECT (two concurrent upserts both see "no existing
--        row" then both INSERT — producing duplicates if no unique index),
--    or (b) return a 500 unique-constraint violation if a partial index
--        existed (graceful-but-noisy). Adding unique indexes + db.transaction
--    wrapping closes this TOCTOU window.
--
-- SYMPTOMS RESOLVED
-- -----------------
-- - Q1-C Day 23 #5989 (webhooks stripe) closed similar pattern; this is the
--   parallel fix for the `payment_receivables` schema family.
-- - getCurrentBalanceUsd was already validated by C14 Revisão as mixing
--   currencies at the SQL SUM level (#6005). This migration provides the
--   column-level guard so that issue becomes solvable.
-- - `processPaymentEvent` had a reference-type/ref-id link via ledger_insert
--   but never captured the resulting ledger.id back to paymentTransactions —
--   re-running the same provider+providerPaymentId (idempotency path) would
--   re-insert a duplicate ledger entry. This is closed by Tier 2 in code
--   (ledgerEntryId population + ledgerPosted=1 update).
--
-- TABLES MODIFIED
-- ---------------
--   1. payment_subscriptions  (1 column added, 1 unique index added)
--   2. payment_providers      (1 unique index added)
--   3. payment_customers      (1 composite unique index added)
--   4. payment_transactions   (1 composite unique index added)
--
-- Total: 5 statements. Well below the 27 libsql batch transaction threshold.
--
-- IDEMPOTENCY
-- -----------
-- ALTER TABLE ADD COLUMN has no IF NOT EXISTS in SQLite (Postgres-only).
-- CREATE UNIQUE INDEX uses IF NOT EXISTS. We rely on Drizzle's
-- `__drizzle_migrations` journal to prevent re-application.
--
-- BACKFILL NOTE
-- -------------
-- Existing payment_subscriptions rows backfill with currency='usd' (the
-- previous implicit assumption). Asaas subscriptions stored as 'usd' are
-- known-bad historical data — see issue body for remediation steps. This is
-- the same acknowledge-known-bad-state pattern documented in #6013.
--
-- REFERENCES
-- ----------
--   - #6013 (this PR cluster — P1 amountUsd receives BRL)
--   - #6014 (sibling in cluster — `as unknown as InsertBuilder` cast removal)
--   - #6015 (sibling in cluster — TOCTOU + ledger linkage)
--   - #6005 (ledger amountUsd real column receives BRL — sibling)
--   - #5993 (Asaas BRL-as-USD in webhook handler — sibling)
--   - L#NN-50 #23 (currency-aware amounts candidate, N=2 → N=4 with #6013)
--   - L#NN-46 v4.6 (atomicity/TOCTOU, N=3 → N=4 with #6015)
--   - 0030_company_cash_ledger_recurring_payable_unique (precedent:
--     partial-unique-index pattern for finance)
--   - 0026_webhook_idempotency_unique (precedent: IF NOT EXISTS pattern)
-- =============================================================================

-- #6013: Add currency column to payment_subscriptions.
-- Backfill existing rows with 'usd' (the previous implicit assumption).
ALTER TABLE `payment_subscriptions` ADD COLUMN `currency` text NOT NULL DEFAULT 'usd';--> statement-breakpoint

-- #6015: Unique index on payment_providers.provider (upsertProvider key).
CREATE UNIQUE INDEX IF NOT EXISTS `payment_providers_provider_unique_idx`
  ON `payment_providers` (`provider`);--> statement-breakpoint

-- #6015: Composite unique index on payment_customers(provider, provider_customer_id)
-- (upsertCustomer key).
CREATE UNIQUE INDEX IF NOT EXISTS `payment_customers_provider_customerid_unique_idx`
  ON `payment_customers` (`provider`, `provider_customer_id`);--> statement-breakpoint

-- #6015: Unique index on payment_subscriptions.provider_subscription_id
-- (upsertSubscription key).
CREATE UNIQUE INDEX IF NOT EXISTS `payment_subscriptions_provider_subid_unique_idx`
  ON `payment_subscriptions` (`provider_subscription_id`);--> statement-breakpoint

-- #6015: Composite unique index on payment_transactions(provider, provider_payment_id)
-- (processPaymentEvent idempotency key — also enforced at the application
-- layer by the existing findFirst-then-insert pattern, but defense-in-depth
-- at the schema level guarantees no duplicates even under raw SQL).
CREATE UNIQUE INDEX IF NOT EXISTS `payment_transactions_provider_paymentid_unique_idx`
  ON `payment_transactions` (`provider`, `provider_payment_id`);