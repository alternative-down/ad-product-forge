ALTER TABLE `system_settings` ADD `memory_last_messages_full_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `memory_last_messages_count` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `token_count_filter_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `token_count_filter_limit` integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `om_observation_message_tokens` integer DEFAULT 15000 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `om_observation_buffer_tokens` real DEFAULT 0.2 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `om_observation_buffer_activation` real DEFAULT 0.8 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `om_observation_previous_observer_tokens` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `om_reflection_observation_tokens` integer DEFAULT 20000 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `om_reflection_buffer_activation` real DEFAULT 0.5 NOT NULL;