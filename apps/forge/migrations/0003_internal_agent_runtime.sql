ALTER TABLE `agents` ADD `execution_state` text DEFAULT 'idle' NOT NULL;
--> statement-breakpoint
CREATE TABLE `agent_execution_contracts` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text NOT NULL,
  `budget_usd` real NOT NULL,
  `auto_renew` integer DEFAULT 1 NOT NULL,
  `starts_at` integer NOT NULL,
  `ends_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_execution_contracts_agent_id_idx` ON `agent_execution_contracts` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `agent_execution_contracts_ends_at_idx` ON `agent_execution_contracts` (`ends_at`);
--> statement-breakpoint

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
CREATE INDEX `agent_execution_steps_agent_id_idx` ON `agent_execution_steps` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `agent_execution_steps_contract_id_idx` ON `agent_execution_steps` (`contract_id`);
--> statement-breakpoint
CREATE INDEX `agent_execution_steps_created_at_idx` ON `agent_execution_steps` (`created_at`);
--> statement-breakpoint

CREATE TABLE `llm_model_prices` (
  `model_key` text PRIMARY KEY NOT NULL,
  `input_per_million_usd` real NOT NULL,
  `input_cache_per_million_usd` real NOT NULL,
  `output_per_million_usd` real NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
