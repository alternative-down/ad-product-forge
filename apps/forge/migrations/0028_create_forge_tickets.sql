-- =============================================================================
-- Migration 0028: Create forge_tickets + forge_ticket_messages tables
-- =============================================================================
--
-- ROOT CAUSE
-- ---------
-- `schema-tickets.ts` defines 2 tables (`forge_tickets`, `forge_ticket_messages`)
-- but no migration has ever created them. Same pattern as the original P0
-- (`knowledge_documents`, `webhook_routes`, `webhook_events` defined in
-- schema but no migration was generated when the schema files were added).
--
-- Originally a runtime "fallback" would create tables outside the migration
-- system. That fallback was removed during the P0 recovery. Now the migration
-- system is 100% responsible for schema creation, so any schema file added
-- without a corresponding CREATE TABLE migration leaves a latent bomb.
--
-- SYMPTOM (latent)
-- ----------------
-- Currently no code path is reading these tables, but they exist in schema
-- meaning someone intends to use them. The first code path that exercises
-- `INSERT INTO forge_tickets` or `SELECT FROM forge_tickets` will fail with
-- `SQLITE_ERROR: no such table: forge_tickets`.
--
-- This is the same trap as the 8h 17min P0 outage on Jun 3 2026.
--
-- TABLES CREATED
-- --------------
--   1. forge_tickets          (10 columns, 4 indexes incl. 1 UNIQUE)
--   2. forge_ticket_messages  (7 columns, 3 indexes)
--
-- Total: 17 statements (2 CREATE TABLE + 7 CREATE INDEX). Well below the
-- 27 libsql batch transaction threshold (the limit that #5438 fixed).
--
-- SCHEMA ALIGNMENT
-- ----------------
-- This migration MUST match the Drizzle schema in `schema-tickets.ts` and
-- the 0027 snapshot (which already includes these tables). Notable choices:
--
-- 1. **No FK on product_id or agent_id**: schema does NOT declare
--    `references()` for these columns (only `ticketId.references(tickets.id)`
--    in the messages table). The issue body proposed FKs to `products` and
--    `agents`, but the schema does not — so the migration matches the
--    schema (no FK). Adding FKs would be a separate refactor PR.
--
-- 2. **`ticket_messages_updated_at_idx` (no `forge_` prefix)**: schema
--    declares `index('ticket_messages_updated_at_idx')` (inconsistent with
--    the other `forge_ticket_messages_*` names). This is tracked in #5470.
--    The migration MUST match the schema's current name. Renaming the
--    schema index is a separate PR.
--
-- 3. **`forge_tickets_external_id_idx` is UNIQUE on nullable column**:
--    SQLite allows multiple NULLs in a UNIQUE index, which matches the
--    schema (externalId is nullable). No change needed.
--
-- 4. **`priority` and `status` are plain text** (no CHECK constraint):
--    the schema declares no enum or check. Match.
--
-- IDEMPOTENCY
-- -----------
-- All statements use `IF NOT EXISTS` (both CREATE TABLE and CREATE INDEX).
-- Re-application is safe even without relying on Drizzle's
-- `__drizzle_migrations` table.
--
-- REFERENCES
-- ----------
--   - #5450 (this issue): 2 missing tables
--   - #5445 (#5443 migration 0027): 7 missing columns
--   - #5432 (PR 0025 fix for knowledge_documents): sibling
--   - P0 outage Jun 3 2026 20:31Z: 8h 17min prod recovery, same root cause
--   - #5470: rename leak (related — schema index missing `forge_` prefix)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `forge_tickets` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL,
  `agent_id` text NOT NULL,
  `subject` text NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `priority` text NOT NULL DEFAULT 'medium',
  `external_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `resolved_at` integer
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `forge_tickets_product_idx` ON `forge_tickets` (`product_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `forge_tickets_agent_idx` ON `forge_tickets` (`agent_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `forge_tickets_status_idx` ON `forge_tickets` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `forge_tickets_external_id_idx` ON `forge_tickets` (`external_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `forge_ticket_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `ticket_id` text NOT NULL,
  `author_type` text NOT NULL,
  `author_agent_id` text,
  `content` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`ticket_id`) REFERENCES `forge_tickets`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `forge_ticket_messages_ticket_idx` ON `forge_ticket_messages` (`ticket_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `forge_ticket_messages_created_at_idx` ON `forge_ticket_messages` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_messages_updated_at_idx` ON `forge_ticket_messages` (`updated_at`);
