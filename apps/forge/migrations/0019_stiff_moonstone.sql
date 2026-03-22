DROP INDEX `function_roles_function_id_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `function_roles_unique_idx` ON `function_roles` (`function_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `function_roles_role_id_idx` ON `function_roles` (`role_id`);--> statement-breakpoint
CREATE INDEX `function_roles_function_id_idx` ON `function_roles` (`function_id`);