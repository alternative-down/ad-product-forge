CREATE TABLE `agent_functions` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_functions_name_idx` ON `agent_functions` (`name`);
--> statement-breakpoint
CREATE TABLE `agent_roles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_roles_name_idx` ON `agent_roles` (`name`);
--> statement-breakpoint
CREATE TABLE `function_roles` (
  `function_id` text NOT NULL,
  `role_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`function_id`) REFERENCES `agent_functions`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `function_roles_function_id_idx` ON `function_roles` (`function_id`);
--> statement-breakpoint
CREATE TABLE `role_tool_permissions` (
  `role_id` text NOT NULL,
  `tool_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_tool_permissions_unique_idx` ON `role_tool_permissions` (`role_id`, `tool_id`);
--> statement-breakpoint
CREATE INDEX `role_tool_permissions_role_id_idx` ON `role_tool_permissions` (`role_id`);
--> statement-breakpoint
CREATE TABLE `role_workflow_permissions` (
  `role_id` text NOT NULL,
  `workflow_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_workflow_permissions_unique_idx` ON `role_workflow_permissions` (`role_id`, `workflow_id`);
--> statement-breakpoint
CREATE INDEX `role_workflow_permissions_role_id_idx` ON `role_workflow_permissions` (`role_id`);
--> statement-breakpoint
ALTER TABLE `agents` ADD `function_id` text REFERENCES `agent_functions`(`id`) ON UPDATE no action ON DELETE set null;
