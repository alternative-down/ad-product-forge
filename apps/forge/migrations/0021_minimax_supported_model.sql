-- Idempotent migration: handles case where M2.5 already exists
UPDATE `llm_profiles`
SET
  `model_key` = 'minimax-coding-plan/MiniMax-M2.5',
  `name` = REPLACE(`name`, 'M2.7', 'M2.5'),
  `updated_at` = strftime('%s','now') * 1000
WHERE `model_key` IN ('minimax-coding-plan/MiniMax-M2.7', 'minimax/MiniMax-M2.7')
  AND NOT EXISTS (SELECT 1 FROM `llm_profiles` WHERE `model_key` = 'minimax-coding-plan/MiniMax-M2.5');--> statement-breakpoint

UPDATE `agent_execution_steps`
SET `model_key` = 'minimax-coding-plan/MiniMax-M2.5'
WHERE `model_key` IN ('minimax-coding-plan/MiniMax-M2.7', 'minimax/MiniMax-M2.7')
  AND NOT EXISTS (SELECT 1 FROM `agent_execution_steps` WHERE `model_key` = 'minimax-coding-plan/MiniMax-M2.5');--> statement-breakpoint

DELETE FROM `llm_model_prices`
WHERE `model_key` IN ('minimax/MiniMax-M2.7');--> statement-breakpoint

DELETE FROM `llm_model_prices`
WHERE `model_key` = 'minimax-coding-plan/MiniMax-M2.7';--> statement-breakpoint

INSERT INTO `llm_model_prices` (
  `model_key`,
  `input_per_million_usd`,
  `input_cache_per_million_usd`,
  `output_per_million_usd`,
  `created_at`,
  `updated_at`
)
SELECT
  'minimax-coding-plan/MiniMax-M2.5',
  0.3,
  0.06,
  1.2,
  strftime('%s','now') * 1000,
  strftime('%s','now') * 1000
WHERE NOT EXISTS (
  SELECT 1
  FROM `llm_model_prices`
  WHERE `model_key` = 'minimax-coding-plan/MiniMax-M2.5'
);
