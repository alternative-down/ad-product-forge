-- Migration: 0028_agent_mcp_tools
-- Feature: MCP tools support for agents (Issue #263 Phase 1)
-- Allows configuring MCP tools that agents can use (client only, no servers)
-- Supports global tools (shared across agents) and agent-specific tools

CREATE TABLE `agent_mcp_tools` (
  `id` text PRIMARY KEY NOT NULL,
  `agent_id` text,
  `name` text NOT NULL,
  `description` text,
  `command` text NOT NULL,
  `args` text NOT NULL,
  `env` text,
  `transport` text NOT NULL DEFAULT 'stdio',
  `version` integer DEFAULT 1 NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_by` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`transport` IN ('stdio', 'sse', 'http'))
);
--> statement-breakpoint
CREATE INDEX `agent_mcp_tools_agent_id_idx` ON `agent_mcp_tools` (`agent_id`);
--> statement-breakpoint
CREATE INDEX `agent_mcp_tools_is_active_idx` ON `agent_mcp_tools` (`is_active`);
