--> statement-breakpoint
ALTER TABLE `forge_communication_conversations` ADD `type` text DEFAULT 'dm' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversations_type` ON `forge_communication_conversations` (`type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `forge_chat_group_members` (
  `group_id` text NOT NULL,
  `participant_id` text NOT NULL,
  `participant_name` text NOT NULL,
  `role` text NOT NULL DEFAULT 'normal',
  `created_at` integer NOT NULL,
  PRIMARY KEY (`group_id`, `participant_id`)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_group_members_group_id` ON `forge_chat_group_members` (`group_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_group_members_participant_id` ON `forge_chat_group_members` (`participant_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `agent_roles` (`id`, `name`, `description`, `created_at`, `updated_at`) VALUES
  ('forge', 'Forge', 'Internal chat group viewing tools.', strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('forge-admin', 'Forge Admin', 'Internal chat group management tools.', strftime('%s','now') * 1000, strftime('%s','now') * 1000);--> statement-breakpoint
INSERT OR IGNORE INTO `role_tool_permissions` (`role_id`, `tool_id`, `created_at`) VALUES
  ('forge', 'list_chat_groups', strftime('%s','now') * 1000),
  ('forge', 'list_group_members', strftime('%s','now') * 1000),
  ('forge-admin', 'list_chat_groups', strftime('%s','now') * 1000),
  ('forge-admin', 'list_group_members', strftime('%s','now') * 1000),
  ('forge-admin', 'create_chat_group', strftime('%s','now') * 1000),
  ('forge-admin', 'add_member_to_group', strftime('%s','now') * 1000),
  ('forge-admin', 'remove_member_from_group', strftime('%s','now') * 1000);
