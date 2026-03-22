ALTER TABLE `llm_profiles` ADD COLUMN `model_key` text;--> statement-breakpoint
ALTER TABLE `llm_profiles` ADD COLUMN `base_url` text;--> statement-breakpoint

UPDATE `llm_profiles`
SET `model_key` = CASE
  WHEN `provider_type` = 'openai-codex' THEN 'account-oauth/openai-codex/' || `model_id`
  WHEN `provider_type` = 'claude-max' THEN 'account-oauth/claude-code/' || `model_id`
  WHEN `provider_type` = 'minimax' THEN 'minimax/' || `model_id`
  ELSE `model_id`
END
WHERE `model_key` IS NULL OR `model_key` = '';--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `llm_profiles_model_key_idx` ON `llm_profiles` (`model_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `llm_profiles_is_enabled_idx` ON `llm_profiles` (`is_enabled`);--> statement-breakpoint

ALTER TABLE `agent_execution_steps` ADD COLUMN `llm_profile_id` text;--> statement-breakpoint

UPDATE `agent_execution_steps`
SET `llm_profile_id` = CASE
  WHEN `kind` = 'om' THEN (
    SELECT `om_model_profile_id`
    FROM `agents`
    WHERE `agents`.`id` = `agent_execution_steps`.`agent_id`
  )
  ELSE (
    SELECT `model_profile_id`
    FROM `agents`
    WHERE `agents`.`id` = `agent_execution_steps`.`agent_id`
  )
END
WHERE `llm_profile_id` IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `agent_execution_steps_llm_profile_id_idx` ON `agent_execution_steps` (`llm_profile_id`);
