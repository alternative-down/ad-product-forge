CREATE TABLE `system_providers` (
  `id` text PRIMARY KEY NOT NULL,
  `provider_type` text NOT NULL,
  `encrypted_credentials` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_provider_unique` ON `system_providers` (`provider_type`);
