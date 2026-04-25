CREATE TABLE `agent_home_metric_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`step_id` text NOT NULL,
	`step_created_at` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`step_id`) REFERENCES `agent_execution_steps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_home_metric_snapshots_agent_id_idx` ON `agent_home_metric_snapshots` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_home_metric_snapshots_created_at_idx` ON `agent_home_metric_snapshots` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_home_metric_snapshots_step_id_idx` ON `agent_home_metric_snapshots` (`step_id`);