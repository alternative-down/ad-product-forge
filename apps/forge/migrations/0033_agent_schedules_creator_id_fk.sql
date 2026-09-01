-- =============================================================================
-- Migration 0033: agentSchedules.creatorId FK to agents.id (ON DELETE SET NULL)
-- (#6045 P2, L#NN-32 v8 + L#NN-46 v4.6 — Day 24 schema-FK pattern codification)
-- =============================================================================
--
-- ROOT CAUSE
-- ---------
-- apps/forge/src/database/schema-agents.ts:267 defines
--   creatorId: text('creator_id'),   -- no .references(), no onDelete
-- This means:
--   1. Orphan creator_id values can exist (no FK constraint to agents.id)
--   2. When an agent is deleted, schedules created by that agent keep the
--      stale creator_id pointing to a now-non-existent agent
--   3. The relationship is undocumented at the schema level, so future
--      developers must read code or grep to discover the soft reference
--
-- Precedent (already in codebase):
--   schema-agents.ts:19  agents.roleId .references(agentRoles.id, onDelete: 'set null')
--   schema-knowledge.ts:16 knowledge.ownerAgentId .references(agents.id, onDelete: 'set null')
--
-- This migration adds the FK constraint and brings creatorId into line with
-- the existing pattern.
--
-- TABLES MODIFIED
-- ---------------
--   1. agent_schedules  (1 FK constraint added)
--
-- Total: 1 statement. Well below the 27 libsql batch transaction threshold.
--
-- IDEMPOTENCY
-- -----------
-- SQLite ALTER TABLE ADD CONSTRAINT is NOT directly supported.
-- We use a 3-step approach (rebuild table with FK):
--   1. PRAGMA foreign_keys = OFF (during rebuild)
--   2. CREATE TABLE _agent_schedules_new with FK + same data
--   3. INSERT INTO _agent_schedules_new SELECT FROM agent_schedules
--   4. DROP TABLE agent_schedules
--   5. ALTER TABLE _agent_schedules_new RENAME TO agent_schedules
--   6. Recreate indexes
--   7. PRAGMA foreign_keys = ON
--   8. PRAGMA foreign_key_check (verify)
--
-- The Drizzle `__drizzle_migrations` journal prevents re-application.
--
-- BACKFILL
-- --------
-- Orphan creator_id values (pointing to non-existent agents) will be
-- SET NULLed by SQLite during the rebuild COPY because the FK is enforced
-- with ON DELETE SET NULL. To preserve semantically meaningful 'orphan'
-- values, set them to NULL explicitly before the rebuild:
--   UPDATE agent_schedules SET creator_id = NULL
--   WHERE creator_id IS NOT NULL
--     AND creator_id NOT IN (SELECT id FROM agents);
--
-- REFERENCES
-- ----------
--   - #6045 (this issue): creatorId missing FK
--   - L#NN-46 v4.6: atomicity / referential integrity pattern
--   - L#NN-32 v8: schema-typed truth (no undocumented soft refs)
-- =============================================================================

-- Step 1: Backfill orphan creator_id values to NULL
UPDATE `agent_schedules`
SET `creator_id` = NULL
WHERE `creator_id` IS NOT NULL
  AND `creator_id` NOT IN (SELECT `id` FROM `agents`);

-- Step 2: Disable FK checks during rebuild
PRAGMA foreign_keys = OFF;--> statement-breakpoint

-- Step 3: Create new table with FK constraint
CREATE TABLE `_agent_schedules_new` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL REFERENCES `agents`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  `name` text NOT NULL,
  `schedule_type` text NOT NULL,
  `cron_expression` text,
  `scheduled_date` integer,
  `timezone` text NOT NULL,
  `content` text NOT NULL,
  `wake_when_running` integer NOT NULL DEFAULT 1,
  `is_active` integer NOT NULL DEFAULT 1,
  `last_triggered_at` integer,
  `next_trigger_at` integer,
  `creator_id` text REFERENCES `agents`(`id`) ON UPDATE NO ACTION ON DELETE SET NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);--> statement-breakpoint

-- Step 4: Copy data from old table
INSERT INTO `_agent_schedules_new` (
  `id`, `agent_id`, `name`, `schedule_type`, `cron_expression`,
  `scheduled_date`, `timezone`, `content`, `wake_when_running`, `is_active`,
  `last_triggered_at`, `next_trigger_at`, `creator_id`, `created_at`, `updated_at`
)
SELECT
  `id`, `agent_id`, `name`, `schedule_type`, `cron_expression`,
  `scheduled_date`, `timezone`, `content`, `wake_when_running`, `is_active`,
  `last_triggered_at`, `next_trigger_at`, `creator_id`, `created_at`, `updated_at`
FROM `agent_schedules`;--> statement-breakpoint

-- Step 5: Drop old table
DROP TABLE `agent_schedules`;--> statement-breakpoint

-- Step 6: Rename new table
ALTER TABLE `_agent_schedules_new` RENAME TO `agent_schedules`;--> statement-breakpoint

-- Step 7: Recreate indexes (preserve existing index names)
CREATE INDEX IF NOT EXISTS `agent_schedules_agent_id_idx` ON `agent_schedules` (`agent_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_schedules_is_active_idx` ON `agent_schedules` (`is_active`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_schedules_next_trigger_at_idx` ON `agent_schedules` (`next_trigger_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedules_creator_id` ON `agent_schedules` (`creator_id`);--> statement-breakpoint

-- Step 8: Re-enable FK checks
PRAGMA foreign_keys = ON;--> statement-breakpoint

-- Step 9: Verify integrity (will fail if FK violation exists)
PRAGMA foreign_key_check;