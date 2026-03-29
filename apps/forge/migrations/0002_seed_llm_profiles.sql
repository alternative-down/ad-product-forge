-- Seed llm_profiles with default LLM configurations
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('profile-openai-gpt54', 'GPT-5.4', 'account-oauth/openai-codex/gpt-5.4', 'https://api.openai.com/v1', '', 1, 1, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('profile-openai-gpt54nano', 'GPT-5.4 Nano', 'account-oauth/openai-codex/gpt-5.4-nano', 'https://api.openai.com/v1', '', 1, 1, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('profile-openai-gpt54mini', 'GPT-5.4 Mini', 'account-oauth/openai-codex/gpt-5.4-mini', 'https://api.openai.com/v1', '', 1, 1, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('profile-claude-opus', 'Claude Opus 4', 'account-oauth/claude-code/claude-opus-4-6', 'https://api.anthropic.com/v1', '', 1, 1, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('profile-claude-sonnet', 'Claude Sonnet 4', 'account-oauth/claude-code/claude-sonnet-4-6', 'https://api.anthropic.com/v1', '', 1, 1, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('profile-claude-haiku', 'Claude Haiku 4', 'account-oauth/claude-code/claude-haiku-4-5', 'https://api.anthropic.com/v1', '', 1, 1, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_profiles` (`id`, `name`, `model_key`, `base_url`, `encrypted_api_key`, `contract_cost_multiplier`, `is_enabled`, `created_at`, `updated_at`) VALUES
('profile-minimax', 'MiniMax M2.5', 'minimax-coding-plan/MiniMax-M2.5', 'https://api.minimax.io', '', 1, 1, 1774809155572, 1774809155572);
