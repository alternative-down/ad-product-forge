CREATE TABLE `llm_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL,
  `label` text NOT NULL,
  `provider_type` text NOT NULL,
  `model_id` text NOT NULL,
  `is_enabled` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `llm_profiles_slug_idx` ON `llm_profiles` (`slug`);
--> statement-breakpoint
CREATE INDEX `llm_profiles_is_enabled_idx` ON `llm_profiles` (`is_enabled`);
--> statement-breakpoint
CREATE TABLE `system_llm_defaults` (
  `id` text PRIMARY KEY NOT NULL,
  `primary_profile_id` text NOT NULL,
  `om_profile_id` text NOT NULL,
  `hiring_rh_profile_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `llm_profiles` (
  `id`,
  `slug`,
  `label`,
  `provider_type`,
  `model_id`,
  `is_enabled`,
  `created_at`,
  `updated_at`
) VALUES
  (
    'openai-codex-gpt-5.4-primary',
    'openai-codex-gpt-5-4-primary',
    'OpenAI Codex GPT-5.4 Primary',
    'openai-codex',
    'gpt-5.4',
    1,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'openai-codex-gpt-5.4-mini-om',
    'openai-codex-gpt-5-4-mini-om',
    'OpenAI Codex GPT-5.4 Mini OM',
    'openai-codex',
    'gpt-5.4-mini',
    1,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  ),
  (
    'openai-codex-gpt-5.4-mini-hiring-rh',
    'openai-codex-gpt-5-4-mini-hiring-rh',
    'OpenAI Codex GPT-5.4 Mini Hiring RH',
    'openai-codex',
    'gpt-5.4-mini',
    1,
    strftime('%s','now') * 1000,
    strftime('%s','now') * 1000
  );
--> statement-breakpoint
INSERT INTO `system_llm_defaults` (
  `id`,
  `primary_profile_id`,
  `om_profile_id`,
  `hiring_rh_profile_id`,
  `created_at`,
  `updated_at`
) VALUES (
  'default',
  'openai-codex-gpt-5.4-primary',
  'openai-codex-gpt-5.4-mini-om',
  'openai-codex-gpt-5.4-mini-hiring-rh',
  strftime('%s','now') * 1000,
  strftime('%s','now') * 1000
);
