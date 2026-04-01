CREATE TABLE `forge_internal_chat_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forge_internal_chat_accounts_slug_idx` ON `forge_internal_chat_accounts` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `forge_internal_chat_accounts_agent_id_idx` ON `forge_internal_chat_accounts` (`agent_id`);--> statement-breakpoint
CREATE TABLE `forge_internal_chat_conversation_members` (
	`conversation_id` text NOT NULL,
	`account_id` text NOT NULL,
	`role` text DEFAULT 'normal' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `forge_internal_chat_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `forge_internal_chat_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forge_internal_chat_conversation_members_unique_idx` ON `forge_internal_chat_conversation_members` (`conversation_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `forge_internal_chat_conversation_members_account_idx` ON `forge_internal_chat_conversation_members` (`account_id`);--> statement-breakpoint
CREATE TABLE `forge_internal_chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text,
	`created_by_account_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_account_id`) REFERENCES `forge_internal_chat_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `forge_internal_chat_conversations_type_idx` ON `forge_internal_chat_conversations` (`type`);--> statement-breakpoint
CREATE INDEX `forge_internal_chat_conversations_updated_at_idx` ON `forge_internal_chat_conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `forge_internal_chat_message_reads` (
	`message_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`message_id`) REFERENCES `forge_internal_chat_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forge_internal_chat_message_reads_unique_idx` ON `forge_internal_chat_message_reads` (`message_id`,`agent_id`);--> statement-breakpoint
CREATE INDEX `forge_internal_chat_message_reads_agent_idx` ON `forge_internal_chat_message_reads` (`agent_id`);--> statement-breakpoint
CREATE INDEX `forge_internal_chat_message_reads_read_at_idx` ON `forge_internal_chat_message_reads` (`read_at`);--> statement-breakpoint
CREATE TABLE `forge_internal_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`author_account_id` text NOT NULL,
	`content` text NOT NULL,
	`reply_to_message_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `forge_internal_chat_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_account_id`) REFERENCES `forge_internal_chat_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `forge_internal_chat_messages_conversation_idx` ON `forge_internal_chat_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `forge_internal_chat_messages_created_at_idx` ON `forge_internal_chat_messages` (`created_at`);--> statement-breakpoint
DROP TABLE `internal_chat_accounts`;--> statement-breakpoint
DROP TABLE `internal_chat_conversation_members`;--> statement-breakpoint
DROP TABLE `internal_chat_conversations`;--> statement-breakpoint
DROP TABLE `internal_chat_message_reads`;--> statement-breakpoint
DROP TABLE `internal_chat_messages`;