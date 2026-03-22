CREATE TABLE `company_recurring_payables` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`amount_usd` real NOT NULL,
	`recurrence_period` text NOT NULL,
	`next_due_at` integer NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `company_recurring_payables_is_active_idx` ON `company_recurring_payables` (`is_active`);
--> statement-breakpoint
CREATE INDEX `company_recurring_payables_next_due_at_idx` ON `company_recurring_payables` (`next_due_at`);
