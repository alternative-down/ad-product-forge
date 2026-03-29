-- Seed llm_model_prices with default pricing data
INSERT OR REPLACE INTO `llm_model_prices` (`model_key`, `input_per_million_usd`, `input_cache_per_million_usd`, `output_per_million_usd`, `created_at`, `updated_at`) VALUES
('account-oauth/openai-codex/gpt-5.4', 2.5, 0.25, 15, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_model_prices` (`model_key`, `input_per_million_usd`, `input_cache_per_million_usd`, `output_per_million_usd`, `created_at`, `updated_at`) VALUES
('account-oauth/openai-codex/gpt-5.4-nano', 0.1, 0.01, 0.4, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_model_prices` (`model_key`, `input_per_million_usd`, `input_cache_per_million_usd`, `output_per_million_usd`, `created_at`, `updated_at`) VALUES
('account-oauth/openai-codex/gpt-5.4-mini', 0.4, 0.04, 3.2, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_model_prices` (`model_key`, `input_per_million_usd`, `input_cache_per_million_usd`, `output_per_million_usd`, `created_at`, `updated_at`) VALUES
('account-oauth/openai-codex/gpt-5.3-codex', 1.75, 0.175, 14, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_model_prices` (`model_key`, `input_per_million_usd`, `input_cache_per_million_usd`, `output_per_million_usd`, `created_at`, `updated_at`) VALUES
('account-oauth/claude-code/claude-opus-4-6', 5, 0.5, 25, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_model_prices` (`model_key`, `input_per_million_usd`, `input_cache_per_million_usd`, `output_per_million_usd`, `created_at`, `updated_at`) VALUES
('account-oauth/claude-code/claude-sonnet-4-6', 3, 0.3, 15, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_model_prices` (`model_key`, `input_per_million_usd`, `input_cache_per_million_usd`, `output_per_million_usd`, `created_at`, `updated_at`) VALUES
('account-oauth/claude-code/claude-haiku-4-5', 1, 0.1, 5, 1774809155572, 1774809155572);
INSERT OR REPLACE INTO `llm_model_prices` (`model_key`, `input_per_million_usd`, `input_cache_per_million_usd`, `output_per_million_usd`, `created_at`, `updated_at`) VALUES
('minimax-coding-plan/MiniMax-M2.5', 0.3, 0.06, 1.2, 1774809155572, 1774809155572);
