PRAGMA foreign_keys=OFF;--> statement-breakpoint

CREATE TABLE `__llm_profile_id_map` (
  `old_id` text PRIMARY KEY NOT NULL,
  `new_id` text NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX `__llm_profile_id_map_new_id_idx` ON `__llm_profile_id_map` (`new_id`);--> statement-breakpoint

INSERT INTO `__llm_profile_id_map` (`old_id`, `new_id`)
SELECT
  `id`,
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  '4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', (abs(random()) % 4) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6)))
FROM `llm_profiles`;--> statement-breakpoint

CREATE TABLE `__new_llm_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `model_key` text NOT NULL,
  `base_url` text,
  `encrypted_api_key` text NOT NULL,
  `contract_cost_multiplier` real DEFAULT 1 NOT NULL,
  `is_enabled` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);--> statement-breakpoint

INSERT INTO `__new_llm_profiles` (
  `id`,
  `name`,
  `model_key`,
  `base_url`,
  `encrypted_api_key`,
  `contract_cost_multiplier`,
  `is_enabled`,
  `created_at`,
  `updated_at`
)
SELECT
  `__llm_profile_id_map`.`new_id`,
  `llm_profiles`.`id`,
  `llm_profiles`.`model_key`,
  `llm_profiles`.`base_url`,
  coalesce(`llm_profiles`.`encrypted_api_key`, ''),
  `llm_profiles`.`contract_cost_multiplier`,
  `llm_profiles`.`is_enabled`,
  `llm_profiles`.`created_at`,
  `llm_profiles`.`updated_at`
FROM `llm_profiles`
INNER JOIN `__llm_profile_id_map` ON `__llm_profile_id_map`.`old_id` = `llm_profiles`.`id`;--> statement-breakpoint

UPDATE `agents`
SET
  `model_profile_id` = (
    SELECT `new_id`
    FROM `__llm_profile_id_map`
    WHERE `old_id` = `agents`.`model_profile_id`
  ),
  `om_model_profile_id` = (
    SELECT `new_id`
    FROM `__llm_profile_id_map`
    WHERE `old_id` = `agents`.`om_model_profile_id`
  );--> statement-breakpoint

UPDATE `agent_execution_steps`
SET `llm_profile_id` = (
  SELECT `new_id`
  FROM `__llm_profile_id_map`
  WHERE `old_id` = `agent_execution_steps`.`llm_profile_id`
);--> statement-breakpoint

UPDATE `system_llm_defaults`
SET
  `primary_profile_id` = (
    SELECT `new_id`
    FROM `__llm_profile_id_map`
    WHERE `old_id` = `system_llm_defaults`.`primary_profile_id`
  ),
  `om_profile_id` = (
    SELECT `new_id`
    FROM `__llm_profile_id_map`
    WHERE `old_id` = `system_llm_defaults`.`om_profile_id`
  ),
  `hiring_rh_profile_id` = (
    SELECT `new_id`
    FROM `__llm_profile_id_map`
    WHERE `old_id` = `system_llm_defaults`.`hiring_rh_profile_id`
  );--> statement-breakpoint

DROP TABLE `llm_profiles`;--> statement-breakpoint
ALTER TABLE `__new_llm_profiles` RENAME TO `llm_profiles`;--> statement-breakpoint

CREATE UNIQUE INDEX `llm_profiles_name_idx` ON `llm_profiles` (`name`);--> statement-breakpoint
CREATE INDEX `llm_profiles_model_key_idx` ON `llm_profiles` (`model_key`);--> statement-breakpoint
CREATE INDEX `llm_profiles_is_enabled_idx` ON `llm_profiles` (`is_enabled`);--> statement-breakpoint

DROP TABLE `__llm_profile_id_map`;--> statement-breakpoint

PRAGMA foreign_keys=ON;
