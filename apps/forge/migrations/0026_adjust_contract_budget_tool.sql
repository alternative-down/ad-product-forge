--> statement-breakpoint
-- Add adjust_agent_contract_budget tool permission to finance role
-- This tool allows agents with finance role to adjust agent contract budgets (increase or decrease)
INSERT INTO `role_tool_permissions` (`role_id`, `tool_id`, `created_at`) VALUES
  ('finance', 'adjust_agent_contract_budget', strftime('%s','now') * 1000);
