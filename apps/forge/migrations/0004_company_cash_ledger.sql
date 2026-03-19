ALTER TABLE `agent_execution_contracts` ADD `funded_at` integer;
--> statement-breakpoint
CREATE TABLE `company_cash_ledger` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `direction` text NOT NULL,
  `amount_usd` real NOT NULL,
  `description` text,
  `reference_type` text,
  `reference_id` text,
  `status` text NOT NULL,
  `due_at` integer,
  `effective_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `company_cash_ledger_status_idx` ON `company_cash_ledger` (`status`);
--> statement-breakpoint
CREATE INDEX `company_cash_ledger_effective_at_idx` ON `company_cash_ledger` (`effective_at`);
