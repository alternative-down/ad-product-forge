-- Idempotent repair for function_roles table structure (ordered version)
-- Always recreates table to ensure correct schema
-- This is a companion to 0022, ensuring proper execution order

-- Step 1: Drop existing function_roles table if it exists
DROP TABLE IF EXISTS `function_roles`;

-- Step 2: Drop any leftover backup from previous runs
DROP TABLE IF EXISTS `function_roles__old`;

-- Step 3: Create function_roles with correct structure
CREATE TABLE `function_roles` (
  `function_id` text NOT NULL,
  `role_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`function_id`) REFERENCES `agent_functions`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Step 4: Create indexes
CREATE UNIQUE INDEX `function_roles_unique_idx` ON `function_roles` (`function_id`,`role_id`);
CREATE INDEX `function_roles_function_id_idx` ON `function_roles` (`function_id`);
CREATE INDEX `function_roles_role_id_idx` ON `function_roles` (`role_id`);
