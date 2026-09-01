ALTER TABLE `agent_home_metric_snapshots` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_schedules` ADD `kind` text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_schedules` ADD `description` text;--> statement-breakpoint
ALTER TABLE `forge_internal_chat_conversation_members` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `forge_internal_chat_message_attachments` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `forge_internal_chat_message_reads` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `forge_internal_chat_message_reads` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `forge_internal_chat_messages` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `currency` text DEFAULT 'usd' NOT NULL;