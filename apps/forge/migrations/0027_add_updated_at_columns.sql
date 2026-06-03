-- =============================================================================
-- Migration 0027: Add missing `updated_at` columns (schema-vs-migration drift)
-- =============================================================================
--
-- ROOT CAUSE
-- ---------
-- The Drizzle schemas in `apps/forge/src/database/schema-{agents,roles,finance}.ts`
-- declare an `updatedAt` column (and in two cases, a corresponding index) on
-- 7 tables. However, the original migration that created each table
-- (predates 0000_broken_natasha_romanoff.sql) did NOT include these columns.
--
-- This created a "schema-vs-migration drift" where the Drizzle schema
-- (used by `drizzle-kit generate` for new migrations) and the live database
-- (built up by the migration history) disagree.
--
-- SYMPTOM
-- -------
-- `/admin/overview` (and any other read model that selects `updated_at` from
-- these tables) returns 500 with `SQLITE_ERROR: no such column: updated_at`.
-- The Drizzle TypeScript types claim the column exists, so the code compiles,
-- but the actual DB has no such column.
--
-- TABLES FIXED
-- ------------
--   1. agent_providers                  (latent)
--   2. agent_execution_contracts        (latent + index created)
--   3. agent_execution_steps            (latent)
--   4. agent_notifications              (latent)
--   5. company_cash_ledger              (🔴 active — /admin/overview 500)
--   6. role_tool_permissions            (latent)
--   7. role_workflow_permissions        (latent)
--
-- system_settings is SKIPPED: it has the column in the migration but NOT in
-- the schema (extra column unused = harmless).
--
-- INDEXES
-- -------
--   1. agent_execution_contracts_updated_at_idx (matches schema-agents.ts:90-91)
--   2. company_cash_ledger_updated_at_idx       (matches schema-finance.ts:31)
--
-- The other 5 tables do NOT have an `updated_at` index in their schema
-- declarations, so no index is created for them.
--
-- DATA MIGRATION
-- --------------
-- All `updated_at` columns are added with `DEFAULT 0`. Existing rows that
-- previously had no `updated_at` will now have `0`. This is semantically
-- imperfect (they have no real "last update" timestamp) but is:
--   - Non-destructive (no data loss)
--   - Idempotent-ish: subsequent re-applies will fail with "duplicate
--     column name: updated_at" if the journal is wiped, but Drizzle's
--     `__drizzle_migrations` table tracks application state and prevents
--     re-application in normal operation
--   - Matches the schema declaration (`integer NOT NULL` — note that the
--     Drizzle schema declares `.notNull()` so `0` is the only valid default
--     that won't break the schema)
--
-- IDEMPOTENCY NOTE
-- ----------------
-- SQLite does NOT support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
-- (Postgres-only). This migration is therefore NOT idempotent at the SQL
-- level — if it is re-applied on a database that already has the columns,
-- SQLite will throw `duplicate column name: updated_at`.
--
-- However, the Drizzle migration runner tracks applied migrations in the
-- `__drizzle_migrations` table and only re-runs a migration if it is
-- missing from the journal. In normal operation, this migration runs
-- EXACTLY ONCE per database.
--
-- For dev/manual recovery (e.g., journal wipe + migration re-apply), the
-- user must either:
--   (a) Drop and recreate the affected tables (DATA LOSS), or
--   (b) Use `pragma_table_info(table_name)` to check before each ALTER.
--       See `memory/schema-vs-migration-drift-audit-2026-06-03.md` for a
--       PRAGMA-based idempotency script (NOT applied here because the
--       codebase convention is to rely on journal-based idempotency).
--
-- REFERENCES
-- ----------
--   - #5443 (this issue): /admin/overview 500
--   - #5441 (Aldric, follow-up): CI guard for schema-vs-migration drift
--   - #5438, #5439, #5440 (predecessor prod fixes): same pattern but for
--     missing TABLES, not missing COLUMNS
-- =============================================================================

ALTER TABLE `agent_providers` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `agent_execution_contracts` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `agent_execution_steps` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `agent_notifications` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `company_cash_ledger` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `role_tool_permissions` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `role_workflow_permissions` ADD COLUMN `updated_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_execution_contracts_updated_at_idx` ON `agent_execution_contracts` (`updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `company_cash_ledger_updated_at_idx` ON `company_cash_ledger` (`updated_at`);
