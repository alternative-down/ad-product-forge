CREATE TABLE `forge_internal_chat_message_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`attachment_index` integer NOT NULL,
	`name` text NOT NULL,
	`content_type` text,
	`size_bytes` integer NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `forge_internal_chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `forge_internal_chat_message_attachments_message_idx` ON `forge_internal_chat_message_attachments` (`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forge_internal_chat_message_attachments_unique_idx` ON `forge_internal_chat_message_attachments` (`message_id`,`attachment_index`);