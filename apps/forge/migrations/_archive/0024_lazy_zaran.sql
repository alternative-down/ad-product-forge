-- =============================================================================
-- ORPHAN FILE — DO NOT APPLY. MOVED TO _archive/ FOR SAFETY ON 2026-06-02.
-- =============================================================================
--
-- Original location: apps/forge/migrations/0024_lazy_zaran.sql
-- Original author:   kaelen-xhhzsg (Kaelen, forge agent)
-- Original commit:   1357e59cc — fix(#1540): add isActive column to agent_execution_contracts
-- Original intent:   ALTER TABLE `agent_execution_contracts` ADD COLUMN `is_active` integer DEFAULT 1
-- Actual content:    28 DROP TABLE statements (28 production tables)
-- Discovery:         Aldric during #5342 (PR #5342 fix(#5327))
-- Issue:             #5346
-- Fix PR:            see git log for the PR that moved this file to _archive/
--
-- WHY THIS FILE IS DANGEROUS
-- --------------------------
-- This file was committed to apps/forge/migrations/ but NEVER ADDED to
-- apps/forge/migrations/meta/_journal.json. Because it is absent from the
-- journal, drizzle-orm's libsql migrator does NOT apply it (the migrator
-- only processes journal entries).
--
-- However, the file is a latent footgun: if anyone ever
--   (a) manually edits _journal.json to add a 0024 entry, or
--   (b) runs a tool that regenerates the journal by scanning the migrations
--       directory,
-- the file would be applied and would DROP 28 production tables, destroying
-- the database.
--
-- WHY THE CONTENT DOES NOT MATCH THE COMMIT MESSAGE
-- -------------------------------------------------
-- The original commit message described this file as the
-- "ALTER TABLE ADD COLUMN migration" companion to a schema.ts change that
-- added the isActive column. The actual content is DROP TABLE statements
-- for 28 tables — clearly the wrong body. The schema.ts change (now
-- preserved in apps/forge/src/database/schema-agents.ts via the #5337
-- schema-relations refactor) made the column addition take effect without
-- this file needing to be applied.
--
-- WHY WE ARE NOT DELETING IT
-- --------------------------
-- The file is preserved for audit/archival purposes. Deleting it would
-- erase the record of the bug that produced it, which could lead to a
-- recurrence.
--
-- SAFE TO DELETE? Yes, but only after this header comment and the commit
-- history make the audit trail unambiguous.
--
-- =============================================================================

DROP TABLE `agent_checkpointed_om_states`;--> statement-breakpoint
DROP TABLE `agent_execution_contracts`;--> statement-breakpoint
DROP TABLE `agent_execution_steps`;--> statement-breakpoint
DROP TABLE `agent_home_metric_snapshots`;--> statement-breakpoint
DROP TABLE `agent_long_term_memory_recall_states`;--> statement-breakpoint
DROP TABLE `agent_long_term_memory_states`;--> statement-breakpoint
DROP TABLE `agent_mcp_configs`;--> statement-breakpoint
DROP TABLE `agent_notifications`;--> statement-breakpoint
DROP TABLE `agent_providers`;--> statement-breakpoint
DROP TABLE `agent_roles`;--> statement-breakpoint
DROP TABLE `agent_schedules`;--> statement-breakpoint
DROP TABLE `agents`;--> statement-breakpoint
DROP TABLE `company_cash_ledger`;--> statement-breakpoint
DROP TABLE `company_recurring_payables`;--> statement-breakpoint
DROP TABLE `forge_internal_chat_accounts`;--> statement-breakpoint
DROP TABLE `forge_internal_chat_conversation_members`;--> statement-breakpoint
DROP TABLE `forge_internal_chat_conversations`;--> statement-breakpoint
DROP TABLE `forge_internal_chat_message_attachments`;--> statement-breakpoint
DROP TABLE `forge_internal_chat_message_reads`;--> statement-breakpoint
DROP TABLE `forge_internal_chat_messages`;--> statement-breakpoint
DROP TABLE `llm_model_prices`;--> statement-breakpoint
DROP TABLE `llm_profiles`;--> statement-breakpoint
DROP TABLE `mcp_server_configs`;--> statement-breakpoint
DROP TABLE `role_tool_permissions`;--> statement-breakpoint
DROP TABLE `role_workflow_permissions`;--> statement-breakpoint
DROP TABLE `system_integrations`;--> statement-breakpoint
DROP TABLE `system_llm_defaults`;--> statement-breakpoint
DROP TABLE `system_settings`;
