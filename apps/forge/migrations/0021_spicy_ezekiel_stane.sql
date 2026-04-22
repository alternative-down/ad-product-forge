CREATE TABLE `agent_long_term_memory_recall_states` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`resource_id` text,
	`snapshot` text,
	`history` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_long_term_memory_states` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`recall_index_stamp` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
