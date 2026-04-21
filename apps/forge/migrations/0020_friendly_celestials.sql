CREATE TABLE `agent_checkpointed_om_states` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_checkpointed_om_states_thread_id_idx` ON `agent_checkpointed_om_states` (`thread_id`);