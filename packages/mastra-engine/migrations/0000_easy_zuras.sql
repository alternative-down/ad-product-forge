CREATE TABLE `forge_communication_accounts` (
	`account_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_account_id` text NOT NULL,
	`display_name` text,
	`metadata_json` text
);
--> statement-breakpoint
CREATE TABLE `forge_communication_contact_accounts` (
	`slug` text NOT NULL,
	`provider` text NOT NULL,
	`external_user_id` text,
	`username` text
);
--> statement-breakpoint
CREATE INDEX `idx_contact_accounts_slug` ON `forge_communication_contact_accounts` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `forge_communication_contact_accounts_slug_provider_external_user_id_username_unique` ON `forge_communication_contact_accounts` (`slug`,`provider`,`external_user_id`,`username`);--> statement-breakpoint
CREATE TABLE `forge_communication_contacts` (
	`slug` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `forge_communication_conversations` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_conversation_key` text NOT NULL,
	`name` text,
	`contact_slug` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_provider` ON `forge_communication_conversations` (`provider`);--> statement-breakpoint
CREATE INDEX `idx_conversations_contact_slug` ON `forge_communication_conversations` (`contact_slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `forge_communication_conversations_provider_provider_conversation_key_unique` ON `forge_communication_conversations` (`provider`,`provider_conversation_key`);--> statement-breakpoint
CREATE TABLE `forge_communication_messages` (
	`message_id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_message_id` text,
	`author_external_id` text,
	`author_display_name` text,
	`author_username` text,
	`content` text NOT NULL,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`unread` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`metadata_json` text
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_id` ON `forge_communication_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_provider` ON `forge_communication_messages` (`provider`);--> statement-breakpoint
CREATE INDEX `idx_messages_unread` ON `forge_communication_messages` (`unread`);--> statement-breakpoint
CREATE INDEX `idx_messages_created_at` ON `forge_communication_messages` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `forge_communication_messages_provider_provider_message_id_unique` ON `forge_communication_messages` (`provider`,`provider_message_id`);