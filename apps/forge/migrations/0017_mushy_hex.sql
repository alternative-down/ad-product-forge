PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`role_id` text,
	`model_profile_id` text NOT NULL,
	`om_model_profile_id` text NOT NULL,
	`instructions` text NOT NULL,
	`execution_state` text DEFAULT 'idle' NOT NULL,
	`last_execution_error` text,
	`last_execution_error_at` integer,
	`workspace_auto_sync` integer DEFAULT 1 NOT NULL,
	`workspace_bm25` integer DEFAULT 1 NOT NULL,
	`workspace_embedder` text DEFAULT 'transformers-multilingual-e5-small-cpu' NOT NULL,
	`workspace_filesystem` text,
	`workspace_sandbox` text,
	`workspace_skills` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`model_profile_id`) REFERENCES `llm_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`om_model_profile_id`) REFERENCES `llm_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_agents`("id", "name", "description", "role_id", "model_profile_id", "om_model_profile_id", "instructions", "execution_state", "last_execution_error", "last_execution_error_at", "workspace_auto_sync", "workspace_bm25", "workspace_embedder", "workspace_filesystem", "workspace_sandbox", "workspace_skills", "created_at", "updated_at") SELECT "id", "name", "description", "role_id", "model_profile_id", "om_model_profile_id", "instructions", "execution_state", "last_execution_error", "last_execution_error_at", "workspace_auto_sync", "workspace_bm25", "workspace_embedder", "workspace_filesystem", "workspace_sandbox", "workspace_skills", "created_at", "updated_at" FROM `agents`;--> statement-breakpoint
DROP TABLE `agents`;--> statement-breakpoint
ALTER TABLE `__new_agents` RENAME TO `agents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;