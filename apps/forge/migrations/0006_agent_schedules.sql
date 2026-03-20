CREATE TABLE `agent_schedules` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL,
  `kind` text DEFAULT 'agent' NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `schedule_type` text NOT NULL,
  `cron_expression` text,
  `scheduled_date` integer,
  `timezone` text NOT NULL,
  `content` text NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `last_triggered_at` integer,
  `next_trigger_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_schedules_agent_id_idx` ON `agent_schedules` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `agent_schedules_is_active_idx` ON `agent_schedules` (`is_active`);
--> statement-breakpoint
CREATE INDEX `agent_schedules_next_trigger_at_idx` ON `agent_schedules` (`next_trigger_at`);
