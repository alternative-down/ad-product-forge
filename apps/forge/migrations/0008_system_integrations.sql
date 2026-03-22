CREATE TABLE `system_integrations` (
  `provider_type` text PRIMARY KEY NOT NULL,
  `encrypted_config` text NOT NULL,
  `is_enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
