CREATE TABLE `agent_notifications` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL,
  `content` text NOT NULL,
  `created_at` integer NOT NULL,
  `read_at` integer,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_notifications_agent_id_idx` ON `agent_notifications` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `agent_notifications_created_at_idx` ON `agent_notifications` (`created_at`);
--> statement-breakpoint
CREATE INDEX `agent_notifications_read_at_idx` ON `agent_notifications` (`read_at`);
