ALTER TABLE `system_settings` ADD `checkpointed_om_enabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `checkpointed_om_total_context_tokens` integer DEFAULT 50000 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `checkpointed_om_recent_raw_tokens` integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `checkpointed_om_raw_observation_batch_tokens` integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `checkpointed_om_observation_reflection_batch_tokens` integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `checkpointed_om_observation_support_tokens` integer DEFAULT 2000 NOT NULL;--> statement-breakpoint
ALTER TABLE `system_settings` ADD `checkpointed_om_reflection_support_tokens` integer DEFAULT 2000 NOT NULL;