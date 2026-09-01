-- Add partial UNIQUE index on (route_id, idempotency_key) for webhook dedup.
--
-- Enforces AC-1 (same key per route = 1 event) at the schema level
-- (defense-in-depth, see also store.ts onConflictDoNothing).
-- The WHERE clause ensures the index only applies when idempotency_key is
-- present — rows with NULL key are NOT subject to uniqueness, which is
-- required for AC-3 (missing key = no dedup).
--
-- Created as PARTIAL UNIQUE INDEX (not a column-level UNIQUE constraint)
-- because Drizzle/sqlite does not support partial unique constraints
-- natively, and we want NULL idempotency_key to remain a valid value.
--
-- Migration is idempotent: uses `IF NOT EXISTS` to allow re-application
-- in case of partial rollback or schema refresh.
--
-- Backfill note: if the existing DB has duplicate (route_id, idempotency_key)
-- pairs, the index creation will fail. Run a pre-migration cleanup script
-- before applying this migration in production environments with existing
-- data (out of scope for this PR; tracked in #5383 follow-ups).

CREATE UNIQUE INDEX IF NOT EXISTS `webhook_events_idempotency_unique_idx`
  ON `webhook_events` (`route_id`, `idempotency_key`)
  WHERE `idempotency_key` IS NOT NULL;--> statement-breakpoint
