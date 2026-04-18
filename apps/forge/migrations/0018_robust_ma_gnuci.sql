ALTER TABLE `system_settings` ADD `ltm_recall_search_mode` text DEFAULT 'hybrid' NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `ltm_recall_workspace_top_k` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `ltm_recall_graph_top_k` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `ltm_recall_graph_threshold` real DEFAULT 0.7 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `ltm_recall_graph_random_walk_steps` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `ltm_recall_graph_include_sources` integer DEFAULT 1 NOT NULL;