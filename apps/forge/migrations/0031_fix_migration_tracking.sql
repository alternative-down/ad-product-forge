-- Fix corrupted __drizzle_migrations tracking table
-- Delete all entries and let drizzle re-apply all idempotent migrations from scratch

DELETE FROM __drizzle_migrations;
