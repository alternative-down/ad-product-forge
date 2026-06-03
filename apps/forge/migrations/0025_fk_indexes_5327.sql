-- =============================================================================
-- Migration 0025: FK indexes + CREATE TABLE knowledge_documents (FIX)
-- =============================================================================
--
-- This migration includes BOTH:
--   A) The original FK indexes (PR #5327)
--   B) The missing CREATE TABLE for `knowledge_documents` (PR #4928 fix)
--
-- HISTORY
-- -------
-- PR #5327 created this migration (tag 0025_fk_indexes_5327) with FK indexes
-- across multiple tables, including `knowledge_documents_owner_agent_id_idx`.
-- The corresponding snapshot (`meta/0025_snapshot.json`) correctly models
-- the `knowledge_documents` table — but the SQL in this file was MISSING
-- the `CREATE TABLE` statement for it.
--
-- On a fresh database (or a database that never had a runtime fallback to
-- create the table), applying 0025 would fail with:
--   SQLITE_ERROR: no such table: main.knowledge_documents
-- This is the same pattern as #5421 (PR #4928 split schema-webhooks.ts
-- without generating CREATE TABLE migrations), but for `knowledge_documents`
-- (from `database/schema-knowledge.ts`).
--
-- The 0025 snapshot already represents the post-migration state correctly
-- (it includes the `knowledge_documents` table). The fix is to make the
-- SQL match the snapshot by adding the `CREATE TABLE IF NOT EXISTS` here.
--
-- `IF NOT EXISTS` is used for idempotency:
--   - If the table exists (e.g., created by a runtime fallback, or a
--     previous successful apply before a partial rollback), it's a no-op.
--   - If the table does not exist (fresh DB), it's created.
--
-- Backfill note: this migration runs BEFORE the FK indexes below. The order
-- matters because the knowledge_documents_owner_agent_id_idx index requires
-- the table to exist.
--
-- Fixes: #5421 (continuation — knowledge_documents branch)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `knowledge_documents` (
  `document_id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `content` text NOT NULL,
  `owner_agent_id` text,
  `source` text,
  `tags` text,
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`owner_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agents_role_id_idx` ON `agents` (`role_id`);--> statement-breakpoint
CREATE INDEX `agents_model_profile_id_idx` ON `agents` (`model_profile_id`);--> statement-breakpoint
CREATE INDEX `agents_om_model_profile_id_idx` ON `agents` (`om_model_profile_id`);--> statement-breakpoint
CREATE INDEX `webhook_routes_agent_id_idx` ON `webhook_routes` (`agent_id`);--> statement-breakpoint
CREATE INDEX `webhook_events_route_id_idx` ON `webhook_events` (`route_id`);--> statement-breakpoint
CREATE INDEX `webhook_events_agent_id_idx` ON `webhook_events` (`agent_id`);--> statement-breakpoint
CREATE INDEX `knowledge_documents_owner_agent_id_idx` ON `knowledge_documents` (`owner_agent_id`);--> statement-breakpoint
CREATE INDEX `forge_internal_chat_conversations_created_by_account_id_idx` ON `forge_internal_chat_conversations` (`created_by_account_id`);--> statement-breakpoint
CREATE INDEX `forge_internal_chat_messages_author_account_id_idx` ON `forge_internal_chat_messages` (`author_account_id`);
