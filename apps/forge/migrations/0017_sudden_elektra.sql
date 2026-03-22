ALTER TABLE `llm_profiles` ADD `name` text;--> statement-breakpoint
UPDATE `llm_profiles` SET `name` = `id` WHERE `name` IS NULL OR `name` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `llm_profiles_name_idx` ON `llm_profiles` (`name`);
