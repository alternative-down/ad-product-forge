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
	`llm_profile_id` text NOT NULL,
	`model_key` text NOT NULL,
	`kind` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer NOT NULL,
	`input_per_million_usd` real DEFAULT 0 NOT NULL,
	`input_cache_per_million_usd` real DEFAULT 0 NOT NULL,
	`output_per_million_usd` real DEFAULT 0 NOT NULL,
	`contract_cost_multiplier` real DEFAULT 1 NOT NULL,
	`cost_usd` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `agent_execution_contracts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`llm_profile_id`) REFERENCES `llm_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `agent_execution_steps_agent_id_idx` ON `agent_execution_steps` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_execution_steps_contract_id_idx` ON `agent_execution_steps` (`contract_id`);--> statement-breakpoint
CREATE INDEX `agent_execution_steps_llm_profile_id_idx` ON `agent_execution_steps` (`llm_profile_id`);--> statement-breakpoint
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
CREATE TABLE `agent_mcp_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`server_id` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `mcp_server_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_agent_mcp_configs_agent_id` ON `agent_mcp_configs` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_mcp_configs_server_id` ON `agent_mcp_configs` (`server_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_mcp_configs_is_active` ON `agent_mcp_configs` (`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_agent_server` ON `agent_mcp_configs` (`agent_id`,`server_id`);--> statement-breakpoint
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
CREATE TABLE `agent_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text,
	`prompt_type` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_prompts_agent_id_idx` ON `agent_prompts` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_prompts_prompt_type_idx` ON `agent_prompts` (`prompt_type`);--> statement-breakpoint
CREATE INDEX `agent_prompts_is_active_idx` ON `agent_prompts` (`is_active`);--> statement-breakpoint
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
	`creator_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_schedules_agent_id_idx` ON `agent_schedules` (`agent_id`);--> statement-breakpoint
CREATE INDEX `agent_schedules_is_active_idx` ON `agent_schedules` (`is_active`);--> statement-breakpoint
CREATE INDEX `agent_schedules_next_trigger_at_idx` ON `agent_schedules` (`next_trigger_at`);--> statement-breakpoint
CREATE INDEX `idx_schedules_creator_id` ON `agent_schedules` (`creator_id`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`function_id` text,
	`model_profile_id` text NOT NULL,
	`om_model_profile_id` text NOT NULL,
	`instructions` text NOT NULL,
	`execution_state` text DEFAULT 'idle' NOT NULL,
	`workspace_auto_sync` integer DEFAULT 1 NOT NULL,
	`workspace_bm25` integer DEFAULT 1 NOT NULL,
	`workspace_embedder` text DEFAULT 'fastembed' NOT NULL,
	`workspace_filesystem` text,
	`workspace_sandbox` text,
	`workspace_skills` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`function_id`) REFERENCES `agent_functions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`model_profile_id`) REFERENCES `llm_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`om_model_profile_id`) REFERENCES `llm_profiles`(`id`) ON UPDATE no action ON DELETE restrict
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
CREATE TABLE `company_recurring_payables` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`amount_usd` real NOT NULL,
	`recurrence_period` text NOT NULL,
	`next_due_at` integer NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `company_recurring_payables_is_active_idx` ON `company_recurring_payables` (`is_active`);--> statement-breakpoint
CREATE INDEX `company_recurring_payables_next_due_at_idx` ON `company_recurring_payables` (`next_due_at`);--> statement-breakpoint
CREATE TABLE `function_roles` (
	`function_id` text NOT NULL,
	`role_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`function_id`) REFERENCES `agent_functions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `function_roles_unique_idx` ON `function_roles` (`function_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `function_roles_function_id_idx` ON `function_roles` (`function_id`);--> statement-breakpoint
CREATE INDEX `function_roles_role_id_idx` ON `function_roles` (`role_id`);--> statement-breakpoint
CREATE TABLE `llm_model_prices` (
	`model_key` text PRIMARY KEY NOT NULL,
	`input_per_million_usd` real NOT NULL,
	`input_cache_per_million_usd` real NOT NULL,
	`output_per_million_usd` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `llm_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model_key` text NOT NULL,
	`base_url` text,
	`encrypted_api_key` text NOT NULL,
	`contract_cost_multiplier` real DEFAULT 1 NOT NULL,
	`is_enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `llm_profiles_name_idx` ON `llm_profiles` (`name`);--> statement-breakpoint
CREATE INDEX `llm_profiles_model_key_idx` ON `llm_profiles` (`model_key`);--> statement-breakpoint
CREATE INDEX `llm_profiles_is_enabled_idx` ON `llm_profiles` (`is_enabled`);--> statement-breakpoint
CREATE TABLE `mastra_instances` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`display_name` text,
	`is_local` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mastra_instances_base_url` ON `mastra_instances` (`base_url`);--> statement-breakpoint
CREATE INDEX `idx_mastra_instances_is_local` ON `mastra_instances` (`is_local`);--> statement-breakpoint
CREATE TABLE `mcp_server_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`transport` text NOT NULL,
	`command` text,
	`args` text,
	`env_vars` text,
	`url` text,
	`headers` text,
	`version` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_server_configs_name` ON `mcp_server_configs` (`name`);--> statement-breakpoint
CREATE INDEX `idx_mcp_server_configs_is_active` ON `mcp_server_configs` (`is_active`);--> statement-breakpoint
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
CREATE INDEX `role_workflow_permissions_role_id_idx` ON `role_workflow_permissions` (`role_id`);--> statement-breakpoint
CREATE TABLE `system_integrations` (
	`provider_type` text PRIMARY KEY NOT NULL,
	`encrypted_config` text NOT NULL,
	`is_enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_llm_defaults` (
	`id` text PRIMARY KEY NOT NULL,
	`primary_profile_id` text NOT NULL,
	`om_profile_id` text NOT NULL,
	`hiring_rh_profile_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`company_context` text NOT NULL,
	`updated_at` integer NOT NULL
);
