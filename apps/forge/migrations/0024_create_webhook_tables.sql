-- =============================================================================
-- Migration 0024: Create webhook_routes and webhook_events tables
-- =============================================================================
--
-- This migration fixes a critical production bug introduced by PR #4928
-- ("refactor: split database/schema.ts into domain-specific files").
--
-- HISTORY
-- -------
-- PR #4928 (commit 67685816a) moved `webhookRoutes` and `webhookEvents`
-- from `database/schema.ts` to the new file `database/schema-webhooks.ts`,
-- but it did NOT generate CREATE TABLE migrations for the new tables.
--
-- The original 0000_broken_natasha_romanoff.sql does NOT include
-- `webhook_routes` or `webhook_events`, so these tables have never been
-- created on any database initialized from scratch using the migrations
-- directory as the source of truth.
--
-- The first migration to reference these tables was 0025_fk_indexes_5327.sql
-- (created by PR #5327), which does:
--   CREATE INDEX `webhook_routes_agent_id_idx` ON `webhook_routes` (`agent_id`);
-- This migration fails immediately on a fresh database because
-- `webhook_routes` does not exist.
--
-- The original deployment worked because a runtime fallback (per the Coolify
-- app description "Deploy after removing fallback") was creating these tables
-- outside the migration system. When that fallback was removed, the migration
-- system became 100% responsible for schema creation, and the missing
-- migration was exposed as a production outage.
--
-- This migration creates the two tables. FK indexes are intentionally NOT
-- included here because migration 0025 creates them with the proper names
-- and FK relationships.
--
-- SAFETY
-- ------
-- A dangerous file `apps/forge/migrations/_archive/0024_lazy_zaran.sql`
-- contains 28 DROP TABLE statements (see its header comment for full
-- history). That file is NOT in `meta/_journal.json` and therefore is
-- never applied by the drizzle migrator. The new file at this path
-- (`0024_create_webhook_tables.sql`) is a separate, safe file. The
-- archive filename matches by coincidence, not intent.
--
-- Fixes: #5421
-- =============================================================================

CREATE TABLE `webhook_routes` (
  `route_id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL,
  `name` text NOT NULL,
  `secret` text,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `route_id` text NOT NULL,
  `agent_id` text NOT NULL,
  `payload` text NOT NULL,
  `headers` text NOT NULL,
  `idempotency_key` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `received_at` integer NOT NULL,
  `processed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`route_id`) REFERENCES `webhook_routes`(`route_id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
