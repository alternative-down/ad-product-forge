CREATE TABLE `agent_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`provider_type` text NOT NULL,
	`encrypted_credentials` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`model` text NOT NULL,
	`om_model` text,
	`instructions` text NOT NULL,
	`tools` text,
	`workflows` text,
	`workspace_auto_sync` integer DEFAULT 1 NOT NULL,
	`workspace_bm25` integer DEFAULT 1 NOT NULL,
	`workspace_embedder` text DEFAULT 'fastembed' NOT NULL,
	`workspace_filesystem` text,
	`workspace_sandbox` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
