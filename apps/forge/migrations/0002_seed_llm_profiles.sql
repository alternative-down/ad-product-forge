-- Custom SQL migration file, put your code below!
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('prof_gpt54', 'GPT-5.4', 'account-oauth/openai-codex/gpt-5.4', NULL, NULL, 1, 1, 1774809648760, 1774809648760);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('prof_gpt54nano', 'GPT-5.4 Nano', 'account-oauth/openai-codex/gpt-5.4-nano', NULL, NULL, 1, 1, 1774809648760, 1774809648760);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('prof_gpt54mini', 'GPT-5.4 Mini', 'account-oauth/openai-codex/gpt-5.4-mini', NULL, NULL, 1, 1, 1774809648760, 1774809648760);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('prof_claudeopus', 'Claude Opus 4', 'account-oauth/claude-code/claude-opus-4-6', NULL, NULL, 1, 1, 1774809648760, 1774809648760);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('prof_claudesonnet', 'Claude Sonnet 4', 'account-oauth/claude-code/claude-sonnet-4-6', NULL, NULL, 1, 1, 1774809648760, 1774809648760);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('prof_claudehaiku', 'Claude Haiku 4', 'account-oauth/claude-code/claude-haiku-4-5', NULL, NULL, 1, 1, 1774809648760, 1774809648760);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('prof_minimax', 'MiniMax M2.5', 'minimax-coding-plan/MiniMax-M2.5', 'https://api.minimax.io', NULL, 1, 1, 1774809648760, 1774809648760);
