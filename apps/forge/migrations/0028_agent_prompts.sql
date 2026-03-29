-- Migration: 0028_agent_prompts
-- Feature: Allow editing agent prompts/system messages (Issue #265)
-- Allows runtime editing of prompts that are injected into agent system context

CREATE TABLE IF NOT EXISTS `agent_prompts` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text,
  `prompt_type` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `content` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_by` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_prompts_agent_id_idx` ON `agent_prompts` (`agent_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_prompts_prompt_type_idx` ON `agent_prompts` (`prompt_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_prompts_is_active_idx` ON `agent_prompts` (`is_active`);
