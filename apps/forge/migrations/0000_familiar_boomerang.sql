CREATE TABLE `agent_execution_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`budget_usd` real NOT NULL,
	`auto_renew` integer DEFAULT 1 NOT NULL,
	`funded_at` integer,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_execution_contracts_agent_id_idx` ON `agent_execution_contracts` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_execution_contracts_ends_at_idx` ON `agent_execution_contracts` (`ends_at`);--> statement-breakpoint
CREATE TABLE `agent_execution_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`contract_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`model_key` text NOT NULL,
	`kind` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `agent_execution_contracts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_execution_steps_agent_id_idx` ON `agent_execution_steps` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_execution_steps_contract_id_idx` ON `agent_execution_steps` (`contract_id`);--> statement-breakpoint
CREATE INDEX `agent_execution_steps_created_at_idx` ON `agent_execution_steps` (`created_at`);--> statement-breakpoint
CREATE TABLE `agent_functions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_functions_name_idx` ON `agent_functions` (`name`);--> statement-breakpoint
CREATE TABLE `agent_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_notifications_agent_id_idx` ON `agent_notifications` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_notifications_created_at_idx` ON `agent_notifications` (`created_at`);--> statement-breakpoint
CREATE INDEX `agent_notifications_read_at_idx` ON `agent_notifications` (`read_at`);--> statement-breakpoint
CREATE TABLE `agent_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`provider_type` text NOT NULL,
	`encrypted_credentials` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_provider_unique` ON `agent_providers` (`agent_id`,`provider_type`);--> statement-breakpoint
CREATE TABLE `agent_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_roles_name_idx` ON `agent_roles` (`name`);--> statement-breakpoint
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
CREATE INDEX `agent_schedules_agent_id_idx` ON `agent_schedules` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_schedules_is_active_idx` ON `agent_schedules` (`is_active`);--> statement-breakpoint
CREATE INDEX `agent_schedules_next_trigger_at_idx` ON `agent_schedules` (`next_trigger_at`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`function_id` text,
	`model` text NOT NULL,
	`om_model` text,
	`instructions` text NOT NULL,
	`execution_state` text DEFAULT 'idle' NOT NULL,
	`workspace_auto_sync` integer DEFAULT 1 NOT NULL,
	`workspace_bm25` integer DEFAULT 1 NOT NULL,
	`workspace_embedder` text DEFAULT 'fastembed' NOT NULL,
	`workspace_filesystem` text,
	`workspace_sandbox` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`function_id`) REFERENCES `agent_functions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `company_cash_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`direction` text NOT NULL,
	`amount_usd` real NOT NULL,
	`description` text,
	`reference_type` text,
	`reference_id` text,
	`status` text NOT NULL,
	`due_at` integer,
	`effective_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `company_cash_ledger_status_idx` ON `company_cash_ledger` (`status`);--> statement-breakpoint
CREATE INDEX `company_cash_ledger_effective_at_idx` ON `company_cash_ledger` (`effective_at`);--> statement-breakpoint
CREATE TABLE `function_roles` (
	`function_id` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`function_id`) REFERENCES `agent_functions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `function_roles_function_id_idx` ON `function_roles` (`function_id`);--> statement-breakpoint
CREATE TABLE `llm_model_prices` (
	`model_key` text PRIMARY KEY NOT NULL,
	`input_per_million_usd` real NOT NULL,
	`input_cache_per_million_usd` real NOT NULL,
	`output_per_million_usd` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `role_tool_permissions` (
	`role_id` text NOT NULL,
	`tool_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_tool_permissions_unique_idx` ON `role_tool_permissions` (`role_id`,`tool_id`);--> statement-breakpoint
CREATE INDEX `role_tool_permissions_role_id_idx` ON `role_tool_permissions` (`role_id`);--> statement-breakpoint
CREATE TABLE `role_workflow_permissions` (
	`role_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_workflow_permissions_unique_idx` ON `role_workflow_permissions` (`role_id`,`workflow_id`);--> statement-breakpoint
CREATE INDEX `role_workflow_permissions_role_id_idx` ON `role_workflow_permissions` (`role_id`);