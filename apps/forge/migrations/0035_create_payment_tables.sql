-- =============================================================================
-- Migration 0035: create payment_providers, payment_customers,
-- payment_subscriptions, payment_transactions (CRITICAL P0 #6315 fix)
-- =============================================================================
--
-- ROOT CAUSE
-- ---------
-- Migration 0036 (PR #6303) was created to create the 4 payment tables that
-- were missing. However, 0036 runs AFTER 0032 (ALTER TABLE payment_subscriptions
-- ADD COLUMN currency) in the journal order (Drizzle migrator preserves journal
-- entry order; it does NOT sort by when).
--
-- Result: 0032 ALTER TABLE payment_subscriptions fails with
-- SQLITE_ERROR: no such table: payment_subscriptions, runMigrations aborts,
-- and the app never starts.
--
-- This migration 0035 runs BEFORE 0032 (inserted at journal idx 33, between
-- 0031 and 0032) to provide the payment tables BEFORE 0032 tries to alter
-- them. 0036 still runs after 0032/0033/0034 and creates the indexes (and
-- is idempotent via CREATE TABLE IF NOT EXISTS for the tables).
--
-- CONSTRAINT REMOVALS (vs 0036)
-- -----------------------------
-- 0035 omits:
--   - currency column on payment_subscriptions (0032 ALTER TABLE adds it)
--   - REFERENCES clauses (PRAGMA foreign_keys is OFF at CREATE TABLE time)
--   - Unique indexes (0036 creates them)
--
-- IDEMPOTENCY
-- -----------
-- CREATE TABLE IF NOT EXISTS - rerunnable safely.
--
-- REFERENCES
-- ----------
--   - #6315 (this issue - P0 dev env crash, 14h22min+ outage)
--   - #6303 (PR for 0036 - broken because 0032 runs first)
--   - #6301 (original P0 issue - payment tables missing)
--   - #6294 (P0 root cause - journal drift)
--   - #6296 (PR - L#NN-46 v4.7 orphan tripwire fix)
--   - 0032_payment_receivables_currency_unique.sql (predecessor - depends on this)
--   - 0036_create_payment_tables.sql (successor - creates indexes after 0032)
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_providers (
  id text PRIMARY KEY NOT NULL,
  provider text NOT NULL,
  api_key_encrypted text,
  webhook_secret_encrypted text,
  is_active integer NOT NULL DEFAULT 0,
  config_json text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_customers (
  id text PRIMARY KEY NOT NULL,
  provider text NOT NULL,
  provider_customer_id text NOT NULL,
  email text,
  name text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_subscriptions (
  id text PRIMARY KEY NOT NULL,
  customer_id text NOT NULL,
  product_id text NOT NULL,
  provider text NOT NULL,
  provider_subscription_id text NOT NULL,
  status text NOT NULL,
  amount_usd real NOT NULL,
  billing_cycle text NOT NULL,
  current_period_start integer,
  current_period_end integer,
  canceled_at integer,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions (
  id text PRIMARY KEY NOT NULL,
  subscription_id text,
  customer_id text NOT NULL,
  provider text NOT NULL,
  provider_payment_id text NOT NULL,
  ledger_entry_id text,
  amount_usd real NOT NULL,
  status text NOT NULL,
  failure_reason text,
  ledger_posted integer NOT NULL DEFAULT 0,
  raw_event_json text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
