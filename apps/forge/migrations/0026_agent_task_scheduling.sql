-- Migration: 0026_agent_task_scheduling
-- Feature: Agent-to-Agent Task Scheduling (Issue #225)
-- Extends scheduled_tasks table with task_type, source_coordinator_id, target_agent_id

CREATE TABLE IF NOT EXISTS `scheduled_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `task_type` text DEFAULT 'schedule' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `priority` text DEFAULT 'normal' NOT NULL,
  `schedule_type` text NOT NULL,
  `cron_expression` text,
  `scheduled_date` integer,
  `timezone` text NOT NULL,
  `content` text NOT NULL,
  `result` text,
  `error` text,
  `is_active` integer DEFAULT 1 NOT NULL,
  `source_coordinator_id` text,
  `target_agent_id` text,
  `last_triggered_at` integer,
  `next_trigger_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scheduled_tasks_agent_id_idx` ON `scheduled_tasks` (`agent_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scheduled_tasks_is_active_idx` ON `scheduled_tasks` (`is_active`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scheduled_tasks_next_trigger_at_idx` ON `scheduled_tasks` (`next_trigger_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scheduled_tasks_target_status_idx` ON `scheduled_tasks` (`target_agent_id`, `status`) WHERE `task_type` = 'task';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scheduled_tasks_coordinator_idx` ON `scheduled_tasks` (`source_coordinator_id`) WHERE `task_type` = 'task';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `scheduled_tasks_unique_duplicate_check_idx` ON `scheduled_tasks` (`target_agent_id`, `task_type`, `scheduled_date`) WHERE `task_type` = 'task' AND `status` = 'pending';
