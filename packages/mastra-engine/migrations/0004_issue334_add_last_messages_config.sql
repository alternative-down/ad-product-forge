-- Migration: 0004_issue334_add_last_messages_config
-- Description: Add lastMessages column to agents table for runtime configuration
-- Issue: #334

ALTER TABLE `agents` ADD COLUMN `last_messages` integer DEFAULT 20;
