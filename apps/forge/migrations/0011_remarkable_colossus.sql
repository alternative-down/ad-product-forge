ALTER TABLE `agents` ADD `model_profile_id` text REFERENCES llm_profiles(id);--> statement-breakpoint
ALTER TABLE `agents` ADD `om_model_profile_id` text REFERENCES llm_profiles(id);--> statement-breakpoint
ALTER TABLE `llm_profiles` ADD `contract_cost_multiplier` real DEFAULT 1 NOT NULL;