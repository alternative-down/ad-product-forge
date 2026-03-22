INSERT INTO `llm_profiles` (
  `id`,
  `slug`,
  `label`,
  `provider_type`,
  `model_id`,
  `contract_cost_multiplier`,
  `is_enabled`,
  `created_at`,
  `updated_at`
)
SELECT
  `id`,
  `slug`,
  `label`,
  `provider_type`,
  `model_id`,
  `contract_cost_multiplier`,
  `is_enabled`,
  strftime('%s','now') * 1000,
  strftime('%s','now') * 1000
FROM (
  SELECT
    'claude-max-claude-sonnet-4-6-primary' AS `id`,
    'claude-max-claude-sonnet-4-6-primary' AS `slug`,
    'Claude Max Sonnet 4.6 Primary' AS `label`,
    'claude-max' AS `provider_type`,
    'claude-sonnet-4-6' AS `model_id`,
    1 AS `contract_cost_multiplier`,
    1 AS `is_enabled`
  UNION ALL
  SELECT
    'claude-max-claude-haiku-4-5-om',
    'claude-max-claude-haiku-4-5-om',
    'Claude Max Haiku 4.5 OM',
    'claude-max',
    'claude-haiku-4-5',
    1,
    1
  UNION ALL
  SELECT
    'claude-max-claude-haiku-4-5-hiring-rh',
    'claude-max-claude-haiku-4-5-hiring-rh',
    'Claude Max Haiku 4.5 Hiring RH',
    'claude-max',
    'claude-haiku-4-5',
    1,
    1
  UNION ALL
  SELECT
    'minimax-m2-7-primary',
    'minimax-m2-7-primary',
    'MiniMax M2.7 Primary',
    'minimax',
    'MiniMax-M2.7',
    1,
    1
  UNION ALL
  SELECT
    'minimax-m2-7-om',
    'minimax-m2-7-om',
    'MiniMax M2.7 OM',
    'minimax',
    'MiniMax-M2.7',
    1,
    1
  UNION ALL
  SELECT
    'minimax-m2-7-hiring-rh',
    'minimax-m2-7-hiring-rh',
    'MiniMax M2.7 Hiring RH',
    'minimax',
    'MiniMax-M2.7',
    1,
    1
) AS `seed`
WHERE NOT EXISTS (
  SELECT 1
  FROM `llm_profiles`
  WHERE `llm_profiles`.`id` = `seed`.`id`
);
