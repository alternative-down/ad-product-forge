CREATE TABLE `forge_chat_group_members` (
	`group_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`participant_name` text NOT NULL,
	`role` text DEFAULT 'normal' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_group_members_group_id` ON `forge_chat_group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_group_members_participant_id` ON `forge_chat_group_members` (`participant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forge_chat_group_members_group_id_participant_id_unique` ON `forge_chat_group_members` (`group_id`,`participant_id`);--> statement-breakpoint
ALTER TABLE `forge_communication_conversations` ADD `type` text DEFAULT 'dm' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_conversations_type` ON `forge_communication_conversations` (`type`);