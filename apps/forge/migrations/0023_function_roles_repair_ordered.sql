ALTER TABLE `function_roles` RENAME TO `function_roles__old`;--> statement-breakpoint
CREATE TABLE `function_roles` (
	`function_id` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`function_id`) REFERENCES `agent_functions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT OR IGNORE INTO `function_roles` (`function_id`, `role_id`, `created_at`)
SELECT `function_id`, `role_id`, `created_at` FROM `function_roles__old`;--> statement-breakpoint
DROP TABLE `function_roles__old`;--> statement-breakpoint
CREATE UNIQUE INDEX `function_roles_unique_idx` ON `function_roles` (`function_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `function_roles_function_id_idx` ON `function_roles` (`function_id`);--> statement-breakpoint
CREATE INDEX `function_roles_role_id_idx` ON `function_roles` (`role_id`);
