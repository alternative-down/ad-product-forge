ALTER TABLE `agents` ADD `workspace_auto_sync` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `workspace_bm25` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `workspace_embedder` text DEFAULT 'fastembed' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `workspace_filesystem` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `workspace_sandbox` text;